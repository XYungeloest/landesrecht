/**
 * Schreibpfad des Bulk-Laufs in den Bestand: `content/norms/baywue/<slug>/`.
 *
 * Es entsteht genau die Ausgangsfassung – `meta.json`, `history.json`, `versions/<Stichtag>.json`.
 * Mehr kann dieser Lauf nicht wissen, und mehr darf er nicht schreiben: Reale Änderungen nach dem
 * Stichtag sind Belege zur Stichtagsbestimmung, keine Simulationsfassungen. Findet der Lauf fremde
 * Fassungen unter `versions/`, rührt er das Verzeichnis nicht an und meldet den Fall.
 *
 * **Alles oder nichts.** Die Norm wird in ein Temp-Verzeichnis geschrieben und erst vollständig per
 * Umbenennung an ihren Platz gebracht; ein Abbruch hinterlässt nie eine halbe Norm.
 * `recoverInterruptedNormWrites` räumt Temp- und Sicherungsverzeichnisse beim nächsten Lauf auf.
 *
 * **Unveränderlichkeit.** Vor jedem Schreiben wird verglichen: Ist der Inhalt schon derselbe, wird
 * nichts geschrieben (`changed: false`). Ein zweiter Lauf über denselben Stand lässt den Bestand
 * deshalb byteidentisch – das ist keine Optimierung, sondern die Prüfbarkeit des Laufs: Ein Diff
 * nach einem Wiederholungslauf ist ein Befund und nie ein Nebeneffekt.
 *
 * Das Verfahren ist das des West-Adapters (`packages/importers/recht-nrw/src/common/persist.ts`);
 * es ist dort erprobt und hier neu geschrieben, weil es die Zielverzeichnisse und die
 * Vergleichsregel dieses Bestands kennt. Das eingefrorene West-Paket wird nur gelesen.
 */
import { randomBytes } from 'node:crypto';
import { readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { jsonText, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { TARGET_JURISDICTION } from '../common/constants.ts';

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
  /** Hat dieser Lauf den Bestand verändert? */
  changed: boolean;
  /** Warum nicht geschrieben wurde (fremde Fassungen); dann ist `changed` falsch. */
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

/**
 * Schreibt die Ausgangsfassung einer Norm. Ohne `write` wird nur verglichen und gemeldet, was ein
 * Schreiblauf täte – dieselbe Aussage, nur ohne Wirkung.
 */
export async function writeNormRecord(options: { root: string; record: NormRecord; baselineDate: string; write: boolean }): Promise<NormWriteResult> {
  const { root, record, baselineDate } = options;
  const slug = record.meta.slug;
  const directory = normsDirectory(root);
  const normDir = join(directory, slug);
  const relative = ['content', 'norms', TARGET_JURISDICTION, slug].join('/');
  const files = [`${relative}/meta.json`, `${relative}/history.json`, `${relative}/versions/${baselineDate}.json`];

  const existingVersions = await readdir(join(normDir, 'versions')).catch(() => [] as string[]);
  const foreignVersions = existingVersions.filter((file) => file !== `${baselineDate}.json`);
  if (foreignVersions.length > 0) {
    return {
      files: [],
      changed: false,
      finding: {
        severity: 'error',
        code: 'existing-versions',
        message: `Für ${slug} liegen bereits weitere Fassungen vor (${foreignVersions.join(', ')}); die Ausgangsfassung überschreibt nichts`,
      },
    };
  }

  const version = record.versions[0];
  if (!version) throw new Error(`${slug}: Normrecord ohne Fassung – der Bestand bekommt keine leere Norm`);
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
  const hasExisting = await readdir(normDir).then(() => true, () => false);
  if (hasExisting) {
    const backup = join(directory, `${NORM_BACKUP_PREFIX}${slug}-${token}`);
    await rename(normDir, backup);
    await rename(temp, normDir);
    await rm(backup, { recursive: true, force: true });
  } else {
    await rename(temp, normDir);
  }
  return { files, changed: true };
}

/**
 * Entfernt das Normverzeichnis eines stillgelegten Slugs – nur, wenn es nachweislich zu dieser Quellidentität gehört
 * (externe Kennung `bayernrecht` in `meta.json`). Ein fremdes Verzeichnis bleibt unberührt.
 */
export async function removeRetiredNormDirectory(root: string, slug: string, sourceIdentity: string): Promise<string | undefined> {
  const normDir = join(normsDirectory(root), slug);
  let meta: { externalIdentifiers?: Array<{ system?: string; value?: string }> } | undefined;
  try {
    meta = JSON.parse(await readFile(join(normDir, 'meta.json'), 'utf8')) as typeof meta;
  } catch {
    return undefined;
  }
  const own = (meta?.externalIdentifiers ?? []).some((identifier) => identifier.system === 'bayernrecht' && identifier.value === sourceIdentity);
  if (!own) throw new Error(`Stillgelegter Slug ${slug}: Verzeichnis gehört nicht zu ${sourceIdentity}; es wird nicht entfernt`);
  await rm(normDir, { recursive: true, force: true });
  return ['content', 'norms', TARGET_JURISDICTION, slug].join('/');
}
