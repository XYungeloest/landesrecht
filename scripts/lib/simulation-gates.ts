/**
 * Gates der Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 6), als Bibliothek für
 * `scripts/check-simulation-gates.ts` und die Unit-Tests:
 *
 *   G2 Baseline-Lock: `versions/<Stichtag>.json` jeder Norm byteidentisch gegen den Referenz-Commit des Landes
 *      (`data/simulation/baseline-locks.json`). Normen, die im Referenz-Commit fehlen (neue Sim-Normen, spätere
 *      Baseline-Importe), sind ausgenommen. Für Normen **mit** Sim-Fassungen gilt keine Freigabe aus
 *      `data/content-immutability-exceptions.json`; für Normen ohne Sim-Fassungen gelten dokumentierte
 *      Freigaben nur, wenn ihr `baseCommit` der Referenz-Commit ist.
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

export const BASELINE_LOCKS_PATH = 'data/simulation/baseline-locks.json';
export const IMMUTABILITY_EXCEPTIONS_PATH = 'data/content-immutability-exceptions.json';

/** Meta-Felder, die eine Sim-Fortschreibung ändern darf (Aufhebung, Nachfolge, additive Beziehungen/Schlagworte). */
export const ADDITIVE_META_FIELDS = ['status', 'expiryDate', 'successor', 'successorTarget', 'relations', 'keywords'] as const;

export type BaselineLocks = Partial<Record<JurisdictionId, string>>;

export interface GateReport {
  gate: string;
  jurisdiction?: JurisdictionId;
  problems: string[];
  notes: string[];
}

interface ImmutabilityExceptions {
  baseCommit?: string;
  entries?: Array<{ key: string; kind: string; reason?: string }>;
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

/** `data/simulation/baseline-locks.json`: `{ "<jurisdiction>": "<commit>" }` – flach, nur Jurisdiktionen. */
export async function readBaselineLocks(root: string): Promise<BaselineLocks> {
  let raw: string;
  try {
    raw = await readFile(join(root, BASELINE_LOCKS_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${BASELINE_LOCKS_PATH}: muss ein Objekt { "<jurisdiction>": "<commit>" } sein`);
  const locks: BaselineLocks = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isJurisdictionId(key)) throw new Error(`${BASELINE_LOCKS_PATH}: unbekannter Schlüssel „${key}“ (zulässig: ${JURISDICTION_IDS.join(', ')})`);
    if (typeof value !== 'string' || !COMMIT_PATTERN.test(value)) throw new Error(`${BASELINE_LOCKS_PATH}.${key}: muss ein Commit-Hash sein`);
    locks[key] = value;
  }
  return locks;
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
export async function checkBaselineLock(root: string, jurisdiction: JurisdictionId, commit: string): Promise<GateReport> {
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
  const exceptionsApply = exceptions?.baseCommit !== undefined && exceptions.baseCommit !== '' && (commit.startsWith(exceptions.baseCommit) || exceptions.baseCommit.startsWith(commit));
  const released = new Set((exceptionsApply ? exceptions?.entries ?? [] : []).map((entry) => entry.key));
  for (const entry of exceptions?.entries ?? []) {
    const match = /^([^/]+)\/(.+)\/([^/]+)$/u.exec(entry.key);
    if (match && match[1] === jurisdiction && withSimVersions.has(match[2]!)) {
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
  for (const key of ['relations', 'keywords'] as const) {
    const oldItems = Array.isArray(oldMeta[key]) ? (oldMeta[key] as unknown[]) : [];
    const newKeys = new Set((Array.isArray(newMeta[key]) ? (newMeta[key] as unknown[]) : []).map(canonical));
    oldItems.forEach((item, index) => {
      if (!newKeys.has(canonical(item))) problems.push(`${context}.${key}[${index}]: Eintrag aus dem Referenz-Commit fehlt oder wurde geändert`);
    });
  }
  return problems;
}

/** G3: meta.json/history.json der Normen mit Sim-Fassungen nur additiv gegenüber dem Referenz-Commit. */
export async function checkAdditiveIdentity(root: string, jurisdiction: JurisdictionId, commit: string): Promise<GateReport> {
  const report: GateReport = { gate: 'G3', jurisdiction, problems: [], notes: [] };
  let tree: Map<string, string>;
  try {
    tree = readReferenceTree(root, commit, jurisdiction);
  } catch {
    report.problems.push(`${BASELINE_LOCKS_PATH}.${jurisdiction}: Referenz-Commit ${commit} ist im Repository nicht auflösbar`);
    return report;
  }
  let checked = 0;
  for (const norm of await scanNormVersions(root, jurisdiction)) {
    if (norm.simVersions.length === 0) continue;
    const relative = `content/norms/${jurisdiction}/${norm.slug}`;
    if (!tree.has(`${relative}/meta.json`)) continue; // eigene Sim-Norm oder Baseline nach dem Referenz-Commit
    checked += 1;
    for (const file of ['meta.json', 'history.json'] as const) {
      const path = `${relative}/${file}`;
      const sha = tree.get(path);
      if (!sha) {
        report.problems.push(`${path}: fehlt im Referenz-Commit ${commit.slice(0, 12)}`);
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
      const before = JSON.parse(git(root, 'show', `${commit}:${path}`)) as Record<string, unknown>;
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
