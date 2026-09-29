/**
 * Baseline-Lock der Simulationsrechtsfortschreibung, gemeinsam für alle Quelladapter.
 *
 * Eine Norm ist gesperrt, sobald die Simulation sie fortgeschrieben hat: Folgefassungen neben
 * `versions/<Stichtag>.json`, Historieneinträge nach dem Stichtag (Änderung, Aufhebung – eine Aufhebung erzeugt keine
 * Fassungsdatei!) oder Beziehungen mit Wirkdatum nach dem Stichtag. Der Baseline-Importer darf eine gesperrte Norm nie
 * neu schreiben: `meta.json`/`history.json` tragen dort additive Sim-Ergänzungen. Ergibt der Import byteidentisch
 * dieselbe Ausgangsfassung, gilt die Norm als unverändert; sonst ist es ein Befund, nie eine Überschreibung.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BaselineLock {
  locked: boolean;
  /** Fassungsdateien neben der Ausgangsfassung. */
  foreignVersions: string[];
  /** Gründe der Sperre (für Befunde). */
  reasons: string[];
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export async function inspectBaselineLock(normDir: string, baseline: string): Promise<BaselineLock> {
  const existingVersions = await readdir(join(normDir, 'versions')).catch(() => [] as string[]);
  const foreignVersions = existingVersions.filter((file) => file !== `${baseline}.json`).sort();
  const reasons: string[] = [];
  if (foreignVersions.length > 0) reasons.push(`weitere Fassungen (${foreignVersions.join(', ')})`);
  const history = await readJson<{ entries?: Array<{ date?: string; type?: string }> }>(join(normDir, 'history.json'));
  const laterEntries = (history?.entries ?? []).filter((entry) => typeof entry.date === 'string' && entry.date > baseline);
  if (laterEntries.length > 0) reasons.push(`Historieneinträge nach dem Stichtag (${laterEntries.map((entry) => `${entry.type ?? '?'} ${entry.date}`).join(', ')})`);
  const meta = await readJson<{ relations?: Array<{ type?: string; date?: string }> }>(join(normDir, 'meta.json'));
  const laterRelations = (meta?.relations ?? []).filter((relation) => typeof relation.date === 'string' && relation.date > baseline);
  if (laterRelations.length > 0) reasons.push(`Beziehungen mit Wirkdatum nach dem Stichtag (${laterRelations.map((relation) => `${relation.type ?? '?'} ${relation.date}`).join(', ')})`);
  return { locked: reasons.length > 0, foreignVersions, reasons };
}

/** Gespeicherte Ausgangsfassung als Text. */
export async function readStoredBaseline(normDir: string, baseline: string): Promise<string | undefined> {
  try {
    return await readFile(join(normDir, 'versions', `${baseline}.json`), 'utf8');
  } catch {
    return undefined;
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}

/**
 * Ist die gespeicherte Ausgangsfassung inhaltlich gleich dem Importergebnis? Verglichen wird kanonisch (Schlüssel
 * sortiert), nicht byteweise: Eine gesperrte Datei darf ohnehin nie neu geschrieben werden, auch nicht wegen
 * einer anderen Schlüsselreihenfolge – nur ein inhaltlicher Unterschied ist ein Befund.
 */
export async function storedBaselineEquals(normDir: string, baseline: string, version: unknown): Promise<boolean> {
  const stored = await readStoredBaseline(normDir, baseline);
  if (stored === undefined) return false;
  try {
    return JSON.stringify(canonical(JSON.parse(stored))) === JSON.stringify(canonical(version));
  } catch {
    return false;
  }
}

/**
 * Baseline-Freeze eines Landes (`data/simulation/baseline-locks.json`, `freeze: true`): Der Ausgangsrechtsstand ist
 * gegen den Freeze-Commit eingefroren. Ein Quelladapter schreibt dann keine Ausgangsfassung neu, nimmt keine zurück und
 * nimmt keine neue auf – außer mit dokumentierter Freigabe in `data/content-immutability-exceptions.json` (Block mit
 * `baseCommit` = Freeze-Commit; `regenerated`/`removed` für bestehende, `added` für neue Normen). Die Validierung der
 * Lock-Datei selbst leisten die Gates (`content:simulation-gates`); hier wird nur gelesen.
 */
export interface BaselineFreeze {
  commit: string;
  /** Freigegebene Schlüssel `<land>/<slug>/<Stichtag>` je Art. */
  released: { regenerated: Set<string>; removed: Set<string>; added: Set<string> };
}

export async function readBaselineFreeze(root: string, jurisdiction: string): Promise<BaselineFreeze | undefined> {
  const locks = await readJson<{ jurisdictions?: Record<string, { commit?: string; freeze?: boolean }> }>(join(root, 'data', 'simulation', 'baseline-locks.json'));
  const lock = locks?.jurisdictions?.[jurisdiction];
  if (!lock?.freeze || typeof lock.commit !== 'string') return undefined;
  const commit = lock.commit;
  type Block = { baseCommit?: string; entries?: Array<{ key: string; kind: string }> };
  const exceptions = await readJson<Block & { releases?: Block[] }>(join(root, 'data', 'content-immutability-exceptions.json'));
  const blocks = exceptions ? [exceptions, ...(exceptions.releases ?? [])] : [];
  const released: BaselineFreeze['released'] = { regenerated: new Set(), removed: new Set(), added: new Set() };
  for (const block of blocks) {
    if (!block.baseCommit || !(commit.startsWith(block.baseCommit) || block.baseCommit.startsWith(commit))) continue;
    for (const entry of block.entries ?? []) {
      if (entry.key.startsWith(`${jurisdiction}/`) && (entry.kind === 'regenerated' || entry.kind === 'removed' || entry.kind === 'added')) released[entry.kind].add(entry.key);
    }
  }
  return { commit, released };
}
