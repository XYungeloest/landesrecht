/**
 * Gates der Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 6), als Bibliothek für
 * `scripts/check-simulation-gates.ts` und die Unit-Tests:
 *
 *   G2 Baseline-Lock: `versions/<Stichtag>.json` jeder Norm byteidentisch gegen den Referenz-Commit des Landes
 *      (`data/simulation/baseline-locks.json`). Normen, die im Referenz-Commit fehlen (neue Sim-Normen, spätere
 *      Baseline-Importe), sind ausgenommen. Für Normen **mit** Sim-Fassungen gilt keine Freigabe aus
 *      `data/content-immutability-exceptions.json`; für Normen ohne Sim-Fassungen gelten dokumentierte
 *      Freigaben nur, wenn ihr `baseCommit` der Referenz-Commit ist. Im Freeze-Land (West, NSH) kommt eine Baseline-Norm
 *      nach dem Freeze-Commit nur mit dokumentierter Freigabe `kind: "added"` hinzu (kein stilles Wachsen durch Bulk-Läufe).
 *      Lock-Datei Schema 2: Jede fortgeschriebene Norm (Sim-Fassung oder Rezept auf die Baseline) braucht einen
 *      akzeptierten Baseline-Seed (SHA-256 der Datei); für Normen mit Seed ersetzt der Seed den Commit-Vergleich –
 *      außer im Freeze-Land (West, NSH), wo beides gilt. G3 vergleicht dann gegen `sourceCommit` des Seeds.
 *   G3 Normidentität additiv: `meta.json`/`history.json` von Normen mit Sim-Fassungen enthalten gegenüber dem
 *      Referenz-Commit alle alten Historieneinträge, Beziehungen und Schlagworte unverändert; alle übrigen
 *      Meta-Felder sind gleich – außer `status`, `expiryDate`, `successor`, `successorTarget`, `relations`,
 *      `keywords`.
 *   G9 Inventar reproduzierbar: das Inventar erneut gerechnet entspricht `data/simulation/source-inventory.json`
 *      (ohne `scannedAt`).
 *
 * Die Vergleiche laufen ohne `git show` je Datei: der Referenzbaum (`git ls-tree`) liefert Blob-Hashes, die
 * Arbeitskopie wird lokal als Git-Blob gehasht.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { isJurisdictionId, JURISDICTION_IDS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { INVENTORY_PATH } from '@landesrecht/importer-simulation/common/paths.ts';
import { scanArchive, type SourceInventory } from '@landesrecht/importer-simulation/inventory/scan.ts';

export { BASELINE_LOCKS_PATH } from '@landesrecht/importer-simulation/common/baseline-locks.ts';
import { BASELINE_LOCKS_PATH, parseBaselineLockFile, type BaselineSeed } from '@landesrecht/importer-simulation/common/baseline-locks.ts';
export const IMMUTABILITY_EXCEPTIONS_PATH = 'data/content-immutability-exceptions.json';

/** Meta-Felder, die eine Sim-Fortschreibung ändern darf (Aufhebung, Nachfolge, additive Beziehungen/Schlagworte). */
export const ADDITIVE_META_FIELDS = ['status', 'expiryDate', 'successor', 'successorTarget', 'relations', 'keywords', 'editorialResolutions'] as const;

export type BaselineLocks = Partial<Record<JurisdictionId, string>>;

export interface GateReport {
  gate: string;
  jurisdiction?: JurisdictionId;
  problems: string[];
  notes: string[];
}

interface ImmutabilityExceptionBlock {
  baseCommit?: string;
  entries?: Array<{ key: string; kind: string; reason?: string }>;
}

interface ImmutabilityExceptions extends ImmutabilityExceptionBlock {
  /** Weitere Freigabeblöcke mit eigenem baseCommit (dieselbe Regel). */
  releases?: ImmutabilityExceptionBlock[];
}

export interface NormVersionFiles {
  slug: string;
  hasBaseline: boolean;
  /** Fassungsdateien außer der Baseline (Sim-Fassungen), ohne `.json`. */
  simVersions: string[];
}

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/u;

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024 });
}

/** Git-Blob-Hash einer Arbeitskopie (`sha1("blob <len>\0" + Inhalt)`). */
export function gitBlobSha1(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.byteLength}\0`).update(content).digest('hex');
}

/** Referenz-Commits je Land aus `data/simulation/baseline-locks.json` (Schema 1 flach oder Schema 2). */
export async function readBaselineLocks(root: string): Promise<BaselineLocks> {
  let raw: string;
  try {
    raw = await readFile(join(root, BASELINE_LOCKS_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const file = parseBaselineLockFile(JSON.parse(raw) as unknown);
  return Object.fromEntries(Object.entries(file.jurisdictions).map(([key, lock]) => [key, lock!.commit])) as BaselineLocks;
}

export interface SeedOptions {
  /** Akzeptierte Seeds des Landes (Slug → Seed); Schema 2. */
  seeds?: ReadonlyMap<string, BaselineSeed>;
  /** Freeze-Land: Commit-Vergleich gilt auch für Normen mit Seed. */
  freeze?: boolean;
}

/** Slugs, die eine Sim-Fortschreibung auf ihre Ausgangsfassung stützen: Sim-Fassung neben der Baseline oder Rezept mit Baseline-Seed. */
export async function fortgeschriebeneBaselines(root: string, jurisdiction: JurisdictionId): Promise<Set<string>> {
  const slugs = new Set((await scanNormVersions(root, jurisdiction)).filter((norm) => norm.hasBaseline && norm.simVersions.length > 0).map((norm) => norm.slug));
  try {
    const manifest = JSON.parse(await readFile(join(root, 'data', 'simulation', jurisdiction, 'consolidation-manifest.json'), 'utf8')) as { recipes?: Array<{ target: string; seedVersionId?: string }> };
    for (const recipe of manifest.recipes ?? []) if (recipe.seedVersionId === SIMULATION_BASELINE_DATE) slugs.add(recipe.target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return slugs;
}

function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * G2 (Seeds): jeder Seed des Landes zeigt auf eine vorhandene Ausgangsfassung mit genau diesem SHA-256; ein
 * `sourceCommit` enthält denselben Inhalt; im Freeze-Land entspricht der Seed dem Freeze-Commit; jede fortgeschriebene
 * Baseline hat einen Seed.
 */
export async function checkBaselineSeeds(root: string, jurisdiction: JurisdictionId, commit: string, seeds: ReadonlyMap<string, BaselineSeed>, options: { freeze?: boolean } = {}): Promise<GateReport> {
  const report: GateReport = { gate: 'G2', jurisdiction, problems: [], notes: [] };
  const required = await fortgeschriebeneBaselines(root, jurisdiction);
  for (const slug of [...required].sort()) {
    if (!seeds.has(slug)) report.problems.push(`${BASELINE_LOCKS_PATH}: fortgeschriebene Norm ${jurisdiction}/${slug} ohne akzeptierten Baseline-Seed (seeds[])`);
  }
  let verified = 0;
  for (const seed of [...seeds.values()].sort((left, right) => left.slug.localeCompare(right.slug))) {
    const path = `content/norms/${jurisdiction}/${seed.slug}/versions/${seed.baselineVersionId}.json`;
    let content: Buffer;
    try {
      content = await readFile(join(root, path));
    } catch {
      report.problems.push(`${BASELINE_LOCKS_PATH}: Seed ${jurisdiction}/${seed.slug} – ${path} fehlt`);
      continue;
    }
    if (sha256Hex(content) !== seed.sha256) {
      report.problems.push(`${path}: SHA-256 ${sha256Hex(content)} weicht vom akzeptierten Seed ${seed.sha256} ab (${seed.decision})`);
      continue;
    }
    for (const [label, reference] of [['sourceCommit', seed.sourceCommit], ...(options.freeze ? [['Freeze-Commit', commit]] : [])] as Array<[string, string | undefined]>) {
      if (!reference) continue;
      let blob: Buffer;
      try {
        blob = execFileSync('git', ['show', `${reference}:${path}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024 });
      } catch {
        report.problems.push(`${BASELINE_LOCKS_PATH}: Seed ${jurisdiction}/${seed.slug} – ${label} ${reference.slice(0, 12)} enthält ${path} nicht`);
        continue;
      }
      if (sha256Hex(blob) !== seed.sha256) report.problems.push(`${BASELINE_LOCKS_PATH}: Seed ${jurisdiction}/${seed.slug} – Inhalt im ${label} ${reference.slice(0, 12)} weicht vom Seed ab`);
    }
    verified += 1;
  }
  report.notes.push(`${jurisdiction}: ${verified} Baseline-Seed(s) geprüft, ${required.size} fortgeschriebene Ausgangsfassung(en)`);
  return report;
}

async function readImmutabilityExceptions(root: string): Promise<ImmutabilityExceptions | undefined> {
  try {
    return JSON.parse(await readFile(join(root, IMMUTABILITY_EXCEPTIONS_PATH), 'utf8')) as ImmutabilityExceptions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Blob-Hashes des Referenz-Commits unter content/norms/<jurisdiction>/ (Pfad → SHA-1). */
export function readReferenceTree(root: string, commit: string, jurisdiction: JurisdictionId): Map<string, string> {
  const blobs = new Map<string, string>();
  const output = git(root, 'ls-tree', '-r', commit, '--', `content/norms/${jurisdiction}`);
  for (const line of output.split('\n')) {
    if (!line) continue;
    const match = /^\d+ blob ([0-9a-f]{40})\t(.+)$/u.exec(line);
    if (match) blobs.set(match[2]!, match[1]!);
  }
  return blobs;
}

export async function scanNormVersions(root: string, jurisdiction: JurisdictionId): Promise<NormVersionFiles[]> {
  const base = join(root, 'content', 'norms', jurisdiction);
  let slugs: string[];
  try {
    slugs = (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const result: NormVersionFiles[] = [];
  for (const slug of slugs) {
    let files: string[];
    try {
      files = (await readdir(join(base, slug, 'versions'))).filter((name) => name.endsWith('.json')).sort();
    } catch {
      files = [];
    }
    const baselineFile = `${SIMULATION_BASELINE_DATE}.json`;
    result.push({ slug, hasBaseline: files.includes(baselineFile), simVersions: files.filter((name) => name !== baselineFile).map((name) => name.replace(/\.json$/u, '')) });
  }
  return result;
}

/** G2 Baseline-Lock eines Landes gegen seinen Referenz-Commit. */
export async function checkBaselineLock(root: string, jurisdiction: JurisdictionId, commit: string, options: SeedOptions = {}): Promise<GateReport> {
  const seeded = (slug: string): boolean => !options.freeze && (options.seeds?.has(slug) ?? false);
  const report: GateReport = { gate: 'G2', jurisdiction, problems: [], notes: [] };
  let tree: Map<string, string>;
  try {
    tree = readReferenceTree(root, commit, jurisdiction);
  } catch {
    report.problems.push(`${BASELINE_LOCKS_PATH}.${jurisdiction}: Referenz-Commit ${commit} ist im Repository nicht auflösbar`);
    return report;
  }
  const norms = await scanNormVersions(root, jurisdiction);
  const withSimVersions = new Set(norms.filter((norm) => norm.simVersions.length > 0).map((norm) => norm.slug));
  const exceptions = await readImmutabilityExceptions(root);
  const blocks: ImmutabilityExceptionBlock[] = exceptions ? [exceptions, ...(exceptions.releases ?? [])] : [];
  const applies = (block: ImmutabilityExceptionBlock): boolean => block.baseCommit !== undefined && block.baseCommit !== '' && (commit.startsWith(block.baseCommit) || block.baseCommit.startsWith(commit));
  const released = new Set(blocks.filter(applies).flatMap((block) => block.entries ?? []).filter((entry) => entry.kind !== 'added').map((entry) => entry.key));
  // Im Freeze-Land darf eine Baseline-Norm nach dem Freeze-Commit nur mit dokumentierter Freigabe (`kind: added`) hinzukommen.
  const releasedAdditions = new Set(blocks.filter(applies).flatMap((block) => block.entries ?? []).filter((entry) => entry.kind === 'added').map((entry) => entry.key));
  // Nur Blöcke, die für diesen Referenz-Commit gelten, geben etwas frei; ältere Blöcke bleiben als Beleg stehen.
  for (const entry of blocks.filter(applies).flatMap((block) => block.entries ?? [])) {
    const match = /^([^/]+)\/(.+)\/([^/]+)$/u.exec(entry.key);
    if (match && match[1] === jurisdiction && withSimVersions.has(match[2]!) && !seeded(match[2]!)) {
      report.problems.push(`${IMMUTABILITY_EXCEPTIONS_PATH}: Freigabe ${entry.key} (${entry.kind}) für eine Norm mit Sim-Fassungen ist unzulässig`);
    }
  }

  const baselineFile = `${SIMULATION_BASELINE_DATE}.json`;
  let checked = 0;
  let releasedCount = 0;
  const known = new Set<string>();
  for (const [path, sha] of tree) {
    const match = new RegExp(`^content/norms/${jurisdiction}/([^/]+)/versions/${baselineFile.replace('.', '\\.')}$`, 'u').exec(path);
    if (!match) continue;
    const slug = match[1]!;
    known.add(slug);
    if (seeded(slug)) continue; // Seed ersetzt den Commit-Vergleich (checkBaselineSeeds)
    checked += 1;
    let status: 'unchanged' | 'changed' | 'removed';
    try {
      status = gitBlobSha1(await readFile(join(root, path))) === sha ? 'unchanged' : 'changed';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      status = 'removed';
    }
    if (status === 'unchanged') continue;
    const key = `${jurisdiction}/${slug}/${SIMULATION_BASELINE_DATE}`;
    const verb = status === 'changed' ? 'verändert' : 'entfernt';
    if (withSimVersions.has(slug)) {
      report.problems.push(`${path}: Baseline-Fassung einer Norm mit Sim-Fassungen wurde gegenüber ${commit.slice(0, 12)} ${verb} (keine Freigabe möglich; Sim-Fassungen setzen die eingefrorene Baseline voraus)`);
    } else if (released.has(key)) {
      releasedCount += 1;
    } else {
      report.problems.push(`${path}: Baseline-Fassung wurde gegenüber Referenz-Commit ${commit.slice(0, 12)} ${verb} (Freigabe nur dokumentiert in ${IMMUTABILITY_EXCEPTIONS_PATH} mit baseCommit ${commit.slice(0, 12)})`);
    }
  }
  const outsideReference = norms.filter((norm) => !known.has(norm.slug));
  const newBaselines = outsideReference.filter((norm) => norm.hasBaseline).length;
  if (options.freeze) {
    for (const norm of outsideReference.filter((entry) => entry.hasBaseline)) {
      const key = `${jurisdiction}/${norm.slug}/${SIMULATION_BASELINE_DATE}`;
      if (releasedAdditions.has(key)) releasedCount += 1;
      else report.problems.push(`content/norms/${jurisdiction}/${norm.slug}/versions/${baselineFile}: neue Baseline-Fassung nach dem Freeze-Commit ${commit.slice(0, 12)} (eingefrorener Ausgangsrechtsstand; Aufnahme nur dokumentiert in ${IMMUTABILITY_EXCEPTIONS_PATH}, kind "added", baseCommit ${commit.slice(0, 12)})`);
    }
  }
  const simNorms = outsideReference.filter((norm) => !norm.hasBaseline).length;
  report.notes.push(`${jurisdiction}: ${checked} Baseline-Fassungen gegen ${commit.slice(0, 12)} geprüft, ${releasedCount} dokumentiert freigegeben, ${withSimVersions.size} Norm(en) mit Sim-Fassungen, ${simNorms} eigene Sim-Norm(en), ${newBaselines} Baseline-Norm(en) nach dem Referenz-Commit`);
  return report;
}

function canonical(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input as Record<string, unknown>).sort().map((key) => [key, sort((input as Record<string, unknown>)[key])]));
    return input;
  };
  return JSON.stringify(sort(value));
}

/** history.json: alte Einträge unverändert enthalten, in alter Reihenfolge; `initialVersionId` gleich. */
export function additiveHistoryProblems(oldHistory: Record<string, unknown>, newHistory: Record<string, unknown>, context: string): string[] {
  const problems: string[] = [];
  if (canonical(oldHistory.initialVersionId) !== canonical(newHistory.initialVersionId)) problems.push(`${context}.initialVersionId: wurde geändert`);
  const oldEntries = Array.isArray(oldHistory.entries) ? oldHistory.entries : [];
  const newKeys = (Array.isArray(newHistory.entries) ? newHistory.entries : []).map(canonical);
  let cursor = -1;
  oldEntries.forEach((entry, index) => {
    const key = canonical(entry);
    const position = newKeys.indexOf(key, cursor + 1);
    if (position < 0) problems.push(`${context}.entries[${index}]: Historieneintrag aus dem Referenz-Commit fehlt oder wurde geändert (${String((entry as Record<string, unknown>).date)} ${String((entry as Record<string, unknown>).type)})`);
    else cursor = position;
  });
  return problems;
}

/** meta.json: alle Felder gleich außer `ADDITIVE_META_FIELDS`; `relations`/`keywords` nur erweitert. */
export function additiveMetaProblems(oldMeta: Record<string, unknown>, newMeta: Record<string, unknown>, context: string): string[] {
  const problems: string[] = [];
  const additive = new Set<string>(ADDITIVE_META_FIELDS);
  for (const key of Object.keys(oldMeta)) {
    if (additive.has(key)) continue;
    if (!(key in newMeta)) problems.push(`${context}.${key}: Baseline-Feld wurde entfernt`);
    else if (canonical(oldMeta[key]) !== canonical(newMeta[key])) problems.push(`${context}.${key}: Baseline-Feld wurde geändert`);
  }
  for (const key of Object.keys(newMeta)) {
    if (!(key in oldMeta) && !additive.has(key)) problems.push(`${context}.${key}: neues Feld ist keine zulässige Sim-Fortschreibung (${ADDITIVE_META_FIELDS.join(', ')})`);
  }
  for (const key of ['relations', 'keywords', 'editorialResolutions'] as const) {
    const oldItems = Array.isArray(oldMeta[key]) ? (oldMeta[key] as unknown[]) : [];
    const newKeys = new Set((Array.isArray(newMeta[key]) ? (newMeta[key] as unknown[]) : []).map(canonical));
    oldItems.forEach((item, index) => {
      if (!newKeys.has(canonical(item))) problems.push(`${context}.${key}[${index}]: Eintrag aus dem Referenz-Commit fehlt oder wurde geändert`);
    });
  }
  return problems;
}

/** G3: meta.json/history.json der Normen mit Sim-Fassungen nur additiv gegenüber dem Referenz-Commit. */
export async function checkAdditiveIdentity(root: string, jurisdiction: JurisdictionId, commit: string, options: SeedOptions = {}): Promise<GateReport> {
  const report: GateReport = { gate: 'G3', jurisdiction, problems: [], notes: [] };
  const trees = new Map<string, Map<string, string>>();
  const treeFor = (reference: string): Map<string, string> | undefined => {
    if (!trees.has(reference)) {
      try {
        trees.set(reference, readReferenceTree(root, reference, jurisdiction));
      } catch {
        report.problems.push(`${BASELINE_LOCKS_PATH}.${jurisdiction}: Referenz-Commit ${reference} ist im Repository nicht auflösbar`);
        return undefined;
      }
    }
    return trees.get(reference);
  };
  if (!treeFor(commit)) return report;
  let checked = 0;
  for (const norm of await scanNormVersions(root, jurisdiction)) {
    if (norm.simVersions.length === 0) continue;
    // Referenz der Normidentität: Freeze-Commit, sonst der Commit, in dem der akzeptierte Seed vorlag.
    const reference = options.freeze ? commit : (options.seeds?.get(norm.slug)?.sourceCommit ?? commit);
    const tree = treeFor(reference);
    if (!tree) continue;
    const relative = `content/norms/${jurisdiction}/${norm.slug}`;
    if (!tree.has(`${relative}/meta.json`)) continue; // eigene Sim-Norm oder Baseline nach dem Referenz-Commit
    checked += 1;
    for (const file of ['meta.json', 'history.json'] as const) {
      const path = `${relative}/${file}`;
      const sha = tree.get(path);
      if (!sha) {
        report.problems.push(`${path}: fehlt im Referenz-Commit ${reference.slice(0, 12)}`);
        continue;
      }
      let current: Buffer;
      try {
        current = await readFile(join(root, path));
      } catch {
        report.problems.push(`${path}: wurde entfernt`);
        continue;
      }
      if (gitBlobSha1(current) === sha) continue;
      const before = JSON.parse(git(root, 'show', `${reference}:${path}`)) as Record<string, unknown>;
      const after = JSON.parse(current.toString('utf8')) as Record<string, unknown>;
      report.problems.push(...(file === 'meta.json' ? additiveMetaProblems(before, after, path) : additiveHistoryProblems(before, after, path)));
    }
  }
  report.notes.push(`${jurisdiction}: ${checked} Norm(en) mit Sim-Fassungen gegen ${commit.slice(0, 12)} auf additive Änderung geprüft`);
  return report;
}

function stripScannedAt(inventory: SourceInventory): string {
  const { scannedAt: _scannedAt, ...rest } = inventory;
  return JSON.stringify(rest);
}

/** G9: Inventar erneut rechnen und mit `data/simulation/source-inventory.json` vergleichen (ohne `scannedAt`). */
export async function checkInventoryReproducible(root: string): Promise<GateReport> {
  const report: GateReport = { gate: 'G9', problems: [], notes: [] };
  const archivePresent = await stat(join(root, 'imports')).then((entry) => entry.isDirectory(), () => false);
  const storedText = await readFile(join(root, INVENTORY_PATH), 'utf8').catch(() => undefined);
  if (!archivePresent) {
    report.notes.push(`imports/ fehlt – Inventar nicht reproduzierbar prüfbar (${storedText === undefined ? 'kein' : 'gespeichertes'} Inventar)`);
    return report;
  }
  if (storedText === undefined) {
    report.notes.push(`${INVENTORY_PATH} fehlt – Inventar noch nicht geschrieben (npm run import:simulation:inventory -- --write)`);
    return report;
  }
  const stored = JSON.parse(storedText) as SourceInventory;
  const current = await scanArchive(root);
  if (stripScannedAt(stored) !== stripScannedAt(current)) {
    const details: string[] = [];
    if (stored.totals.files !== current.totals.files) details.push(`Dateien ${stored.totals.files} → ${current.totals.files}`);
    if (stored.totals.sources !== current.totals.sources) details.push(`Quellen ${stored.totals.sources} → ${current.totals.sources}`);
    const storedHashes = new Set(stored.sources.map((source) => source.sha256));
    const currentHashes = new Set(current.sources.map((source) => source.sha256));
    const added = [...currentHashes].filter((sha) => !storedHashes.has(sha)).length;
    const removed = [...storedHashes].filter((sha) => !currentHashes.has(sha)).length;
    if (added || removed) details.push(`Quellen neu ${added}, fehlend ${removed}`);
    report.problems.push(`${INVENTORY_PATH}: entspricht nicht dem neu gerechneten Inventar (${details.join('; ') || 'Details oder Werkzeugversion abweichend'}); npm run import:simulation:inventory -- --write`);
  } else report.notes.push(`Inventar reproduzierbar: ${current.totals.sources} Quellen aus ${current.totals.files} Dateien`);
  return report;
}

/**
 * Evidenzhierarchie der Sim-Quellen (docs/SIMULATION_IMPORT.md 2.1):
 *   1 Original-Verkündungsblatt / amtliche Primärveröffentlichung
 *   2 amtlicher Einzelakt oder amtliche Verkündungsmitteilung (auch verkündete Drucksache)
 *   3 spätere amtliche Wiederveröffentlichung / amtliche Rückreferenz
 *   4 technische oder verzeichnisartige Sekundärquelle (z. B. Wiki-Blattverzeichnis)
 *   5 Presse und sonstige Information
 * `sources[].evidenceLevel` setzt die Ebene ausdrücklich; sonst folgt sie aus `documentType`.
 */
export const EVIDENCE_LEVEL_BY_DOCUMENT_TYPE: Readonly<Record<string, number>> = {
  gazette: 1,
  'ministerial-gazette': 1,
  'standalone-official-act': 2,
  'promulgation-notice': 2,
  'repeal-notice': 2,
  'legislative-document': 2,
  annex: 2,
  draft: 4,
  informational: 4,
  unknown: 4,
  'press-release': 5,
};

/** Rollen und Belegarten, die eine Quelle der Ebene 4/5 nie tragen darf (Wortlaut, Verkündung, Rechtswirkung). */
const PRIMARY_KINDS = new Set(['simulation-gazette', 'simulation-standalone-act', 'simulation-promulgation-evidence', 'simulation-amendment-source']);

export function evidenceLevel(entry: { documentType?: string; evidenceLevel?: number } | undefined): number | undefined {
  if (!entry) return undefined;
  if (typeof entry.evidenceLevel === 'number') return entry.evidenceLevel;
  return EVIDENCE_LEVEL_BY_DOCUMENT_TYPE[entry.documentType ?? 'unknown'] ?? 4;
}

/** G11: Keine Wortlaut-, Verkündungs- oder Rechtswirkungsgrundlage aus Sekundärquellen (Ebene 4/5). */
export async function checkEvidenceHierarchy(root: string, jurisdiction: JurisdictionId): Promise<GateReport> {
  const report: GateReport = { gate: 'G11', jurisdiction, problems: [], notes: [] };
  const dir = join(root, 'data', 'simulation', jurisdiction);
  const readJson = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf8'));
  let sources: Array<{ sha256: string; documentType?: string; evidenceLevel?: number }>;
  try {
    sources = (await readJson(join(dir, 'sources.json'))).sources ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return report;
    throw error;
  }
  const bySha = new Map(sources.map((entry) => [entry.sha256, entry]));
  for (const entry of sources) {
    if (entry.evidenceLevel !== undefined && ![1, 2, 3, 4, 5].includes(entry.evidenceLevel)) report.problems.push(`sources.json ${entry.sha256.slice(0, 12)}: evidenceLevel ${String(entry.evidenceLevel)} unzulässig (1–5)`);
  }
  const secondary = (sha: string | undefined): boolean => (evidenceLevel(sha ? bySha.get(sha) : undefined) ?? 1) >= 4;
  const checkReferences = (references: Array<{ kind?: string; sha256?: string; sourceRole?: string }> | undefined, context: string): void => {
    for (const reference of references ?? []) {
      if (!reference.sha256 || !secondary(reference.sha256)) continue;
      if (PRIMARY_KINDS.has(String(reference.kind)) || reference.sourceRole === 'structure-bearing' || reference.sourceRole === 'amendment-evidence') {
        report.problems.push(`${context}: Sekundärquelle ${reference.sha256.slice(0, 12)} (Ebene ${evidenceLevel(bySha.get(reference.sha256))}) als ${reference.kind}${reference.sourceRole ? `/${reference.sourceRole}` : ''} – Ebene 4/5 darf weder Wortlaut noch Verkündung noch Rechtswirkung tragen`);
      }
    }
  };
  let acts = 0;
  const actFiles = await readdir(join(dir, 'acts')).catch(() => [] as string[]);
  for (const name of actFiles.filter((file) => file.endsWith('.json')).sort()) {
    const act = await readJson(join(dir, 'acts', name));
    acts += 1;
    const context = `acts/${name}`;
    if (secondary(act.provenance?.transcribedFrom)) report.problems.push(`${context}: Wortlautquelle ${String(act.provenance.transcribedFrom).slice(0, 12)} ist Sekundärquelle (Ebene 4/5)`);
    checkReferences(act.version?.sourceReferences, `${context}.version`);
    checkReferences(act.meta?.sourceReferences, `${context}.meta`);
    const references = [...(act.version?.sourceReferences ?? []), ...(act.meta?.sourceReferences ?? [])];
    if (!references.some((reference: { kind?: string; sha256?: string }) => PRIMARY_KINDS.has(String(reference.kind)) && reference.sha256 && !secondary(reference.sha256))) {
      report.problems.push(`${context}: kein amtlicher Beleg der Ebene 1–3 (Blatt, Einzelakt oder Verkündungsmitteilung)`);
    }
  }
  let recipes = 0;
  for (const actDir of await readdir(join(dir, 'amendments')).catch(() => [] as string[])) {
    for (const name of (await readdir(join(dir, 'amendments', actDir)).catch(() => [] as string[])).filter((file) => file.endsWith('.json'))) {
      recipes += 1;
      checkReferences((await readJson(join(dir, 'amendments', actDir, name))).sourceReferences, `amendments/${actDir}/${name}`);
    }
  }
  let applied = 0;
  try {
    for (const event of (await readJson(join(dir, 'ledger.json'))).events ?? []) {
      if (event.status !== 'applied') continue;
      applied += 1;
      const evidence: string[] = [...(event.evidence ?? []), ...(event.publication?.sha256 ? [event.publication.sha256] : [])];
      if (evidence.length > 0 && evidence.every((sha) => secondary(sha))) report.problems.push(`ledger.json ${event.id}: angewandt, aber nur mit Sekundärquellen belegt`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  report.notes.push(`${jurisdiction}: Evidenzhierarchie geprüft – ${acts} Akt(e), ${recipes} Rezept(e), ${applied} angewandte Ereignisse, ${sources.filter((entry) => (evidenceLevel(entry) ?? 1) >= 4).length} Sekundärquelle(n)`);
  return report;
}
