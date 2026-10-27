#!/usr/bin/env node
/** Lokaler Wiederaufbau → SQLite-Sicherung → Wiederherstellung; niemals Remote oder Ost. */
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadJurisdictionNorms, loadJurisdictionPublications } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';

const root = resolveRepositoryRoot();
const parent = join(root, '.cache', 'restore-drill');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'local-'));
for (const jurisdiction of ['west', 'nsh', 'baywue'] as const) {
  const original = await openSqliteD1(join(directory, `${jurisdiction}.sqlite`), { migrationsDir: join(root, 'data/d1') });
  const records = await loadJurisdictionNorms(jurisdiction, root);
  const publications = await loadJurisdictionPublications(jurisdiction, root);
  executePlan(original, buildProjectionPlan(records, { jurisdiction, publications }));
  checkSearchIndexIntegrity(original);
  // Vergleicht die vollständigen logischen Nutzdaten, einschließlich FTS-Eingaben und Laufzeitmetadaten.
  const digest = (db: typeof original): string => {
    const hash = createHash('sha256');
    const tables = db.native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'law_%' ORDER BY name").all() as Array<{ name: string }>;
    for (const { name } of tables) {
      assert.match(name, /^law_[a-z_]+$/u);
      hash.update(name);
      const rows = db.native.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row, (_key, value: unknown) => value instanceof Uint8Array ? [...value] : value)).sort();
      for (const row of rows) hash.update(row + '\n');
    }
    return hash.digest('hex');
  };
  const expected = digest(original);
  const backup = join(directory, `${jurisdiction}.backup.sqlite`);
  original.native.prepare('VACUUM INTO ?').run(backup);
  original.close();
  const restoredPath = join(directory, `${jurisdiction}.restored.sqlite`);
  await copyFile(backup, restoredPath);
  const restored = await openSqliteD1(restoredPath);
  assert.equal(restored.native.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
  assert.equal(digest(restored), expected);
  checkSearchIndexIntegrity(restored);
  restored.close();
  console.log(`${jurisdiction}: Wiederaufbau aus Git, lokale Sicherung und Restore bestanden (${records.length} Normen, ${publications.length} Verkündungen, vollständiger Datenvergleich ${expected}).`);
}
console.log(`Nur lokale Dateien: ${directory}. Kein Cloudflare-Export und kein Remote-Restore getestet.`);
