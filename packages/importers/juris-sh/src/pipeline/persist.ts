/**
 * Schreibpfad des Bulk-Laufs in den Bestand: `content/norms/nsh/<slug>/`.
 *
 * Es entsteht genau die Ausgangsfassung – `meta.json`, `history.json`, `versions/<Stichtag>.json`. Reale
 * Änderungen nach dem Stichtag sind Belege zur Stichtagsbestimmung, keine Simulationsfassungen. Findet der
 * Lauf fremde Fassungen unter `versions/`, rührt er das Verzeichnis nicht an und meldet den Fall.
 *
 * Verfahren wie im BayWü-Adapter (`packages/importers/bayernrecht/src/bulk/persist.ts`, dort nur gelesen):
 * alles oder nichts (Temp-Verzeichnis, dann Umbenennung), Vergleich vor dem Schreiben (ein Wiederholungslauf
 * über denselben Stand lässt den Bestand byteidentisch), Aufräumen abgebrochener Schreibvorgänge. Neu
 * geschrieben, weil Zielverzeichnis und Eigentumsprüfung (`juris-sh`-Kennung) zu diesem Bestand gehören.
 */
import { randomBytes } from 'node:crypto';
import { readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { jsonText, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { SOURCE_SYSTEM, TARGET_JURISDICTION } from '../common/constants.ts';

export const NORM_TEMP_PREFIX = '.tmp-norm-';
export const NORM_BACKUP_PREFIX = '.old-norm-';

export function normsDirectory(root: string): string {
  return join(root, 'content', 'norms', TARGET_JURISDICTION);
}

/** Vorhandene Normverzeichnisse der Jurisdiktion – Grundlage der Kollisionsprüfung der Slugvergabe. */
export async function listExistingSlugs(root: string): Promise<Set<string>> {
  const entries = await readdir(normsDirectory(root), { withFileTypes: true }).catch(() => []);
  return new Set(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name));
}

/** Stellt nach einem harten Abbruch einen konsistenten Normbestand her (Temp weg, Sicherung zurück). */
export async function recoverInterruptedNormWrites(root: string): Promise<string[]> {
  const directory = normsDirectory(root);
  const actions: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return actions;
  }
  for (const entry of entries.filter((name) => name.startsWith(NORM_TEMP_PREFIX))) {
    await rm(join(directory, entry), { recursive: true, force: true });
    actions.push(`entfernt ${entry}`);
  }
  for (const entry of entries.filter((name) => name.startsWith(NORM_BACKUP_PREFIX))) {
    const slug = entry.slice(NORM_BACKUP_PREFIX.length).replace(/-\d+-[a-f0-9]{8}$/u, '');
    if (!entries.includes(slug)) {
      await rename(join(directory, entry), join(directory, slug));
      actions.push(`wiederhergestellt ${slug}`);
    } else {
      await rm(join(directory, entry), { recursive: true, force: true });
      actions.push(`entfernt ${entry}`);
    }
  }
  return actions;
}

export interface NormWriteResult {
  /** Repo-relative Pfade der Norm (auch im Dry-run und wenn nichts geschrieben wurde). */
  files: string[];
  /** Hat dieser Lauf den Bestand verändert (bzw. würde er ihn im Dry-run verändern)? */
  changed: boolean;
  /** Warum nicht geschrieben wurde (fremde Fassungen, fremdes Verzeichnis); dann ist `changed` falsch. */
  finding?: ImportFinding;
}

async function readTextIfPresent(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Gehört ein vorhandenes Normverzeichnis zu dieser Quellidentität (externe Kennung `juris-sh`)? */
async function ownership(normDir: string, sourceIdentity: string): Promise<'absent' | 'own' | 'foreign'> {
  const text = await readTextIfPresent(join(normDir, 'meta.json'));
  if (text === undefined) return (await readdir(normDir).then(() => true, () => false)) ? 'foreign' : 'absent';
  try {
    const meta = JSON.parse(text) as { externalIdentifiers?: Array<{ system?: string; value?: string }> };
    return (meta.externalIdentifiers ?? []).some((identifier) => identifier.system === SOURCE_SYSTEM && identifier.value === sourceIdentity) ? 'own' : 'foreign';
  } catch {
    return 'foreign';
  }
}

/**
 * Schreibt die Ausgangsfassung einer Norm. Ohne `write` wird nur verglichen und gemeldet, was ein
 * Schreiblauf täte – dieselbe Aussage, nur ohne Wirkung.
 */
export async function writeNormRecord(options: { root: string; record: NormRecord; sourceIdentity: string; baselineDate: string; write: boolean }): Promise<NormWriteResult> {
  const { root, record, baselineDate, sourceIdentity } = options;
  const slug = record.meta.slug;
  const directory = normsDirectory(root);
  const normDir = join(directory, slug);
  const relative = ['content', 'norms', TARGET_JURISDICTION, slug].join('/');
  const files = [`${relative}/meta.json`, `${relative}/history.json`, `${relative}/versions/${baselineDate}.json`];

  const owner = await ownership(normDir, sourceIdentity);
  if (owner === 'foreign') {
    return { files: [], changed: false, finding: { severity: 'error', code: 'foreign-norm-directory', message: `${relative} gehört nicht zu ${sourceIdentity}; es wird nichts überschrieben` } };
  }
  const existingVersions = await readdir(join(normDir, 'versions')).catch(() => [] as string[]);
  const foreignVersions = existingVersions.filter((file) => file !== `${baselineDate}.json`);
  if (foreignVersions.length > 0) {
    return { files: [], changed: false, finding: { severity: 'error', code: 'existing-versions', message: `Für ${slug} liegen bereits weitere Fassungen vor (${foreignVersions.join(', ')}); die Ausgangsfassung überschreibt nichts` } };
  }

  const version = record.versions[0];
  if (!version || record.versions.length !== 1) throw new Error(`${slug}: Ausgangsbestand braucht genau eine Fassung (${record.versions.length})`);
  if (version.simulationValidFrom !== baselineDate) throw new Error(`${slug}: Fassung beginnt ${version.simulationValidFrom}, erwartet Stichtag ${baselineDate}`);
  const wanted: Array<[string, unknown]> = [
    [join(normDir, 'meta.json'), record.meta],
    [join(normDir, 'history.json'), record.history],
    [join(normDir, 'versions', `${baselineDate}.json`), version],
  ];
  let changed = false;
  for (const [file, value] of wanted) {
    if ((await readTextIfPresent(file)) !== jsonText(value)) changed = true;
  }
  if (!changed || !options.write) return { files, changed };

  const token = `${process.pid}-${randomBytes(4).toString('hex')}`;
  const temp = join(directory, `${NORM_TEMP_PREFIX}${slug}-${token}`);
  await writeFileAtomic(join(temp, 'meta.json'), jsonText(record.meta));
  await writeFileAtomic(join(temp, 'history.json'), jsonText(record.history));
  await writeFileAtomic(join(temp, 'versions', `${baselineDate}.json`), jsonText(version));
  if (owner === 'own') {
    const backup = join(directory, `${NORM_BACKUP_PREFIX}${slug}-${token}`);
    await rename(normDir, backup);
    await rename(temp, normDir);
    await rm(backup, { recursive: true, force: true });
  } else {
    await rename(temp, normDir);
  }
  return { files, changed: true };
}

/** Entfernt das Verzeichnis einer Norm, die nicht mehr übernommen wird – nur, wenn es nachweislich ihr gehört. */
export async function removeOwnNormDirectory(options: { root: string; slug: string; sourceIdentity: string; write: boolean }): Promise<string | undefined> {
  const normDir = join(normsDirectory(options.root), options.slug);
  const owner = await ownership(normDir, options.sourceIdentity);
  if (owner === 'absent') return undefined;
  if (owner === 'foreign') throw new Error(`content/norms/${TARGET_JURISDICTION}/${options.slug} gehört nicht zu ${options.sourceIdentity}; es wird nicht entfernt`);
  if (options.write) await rm(normDir, { recursive: true, force: true });
  return ['content', 'norms', TARGET_JURISDICTION, options.slug].join('/');
}
