#!/usr/bin/env node
/**
 * D1-Projektion aus dem Git-Bestand – deterministisch, je Jurisdiktion eine Datenbank.
 *
 *   node scripts/project-d1.ts --target local [--reset] [--jurisdiction west]
 *       schreibt data/runtime/landesrecht-<jurisdiction>.sqlite (node:sqlite, Migrationen aus data/d1/)
 *   node scripts/project-d1.ts --target remote-plan [--jurisdiction west]
 *       schreibt data/runtime/landesrecht-<jurisdiction>.sql für `wrangler d1 execute <db> --remote --file …`
 *   node scripts/project-d1.ts --target plan
 *       gibt nur die Plan-Statistik aus
 *
 * Es wird nie automatisch gegen eine produktive Datenbank geschrieben (docs/DEPLOYMENT.md).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { JURISDICTION_IDS, isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { D1_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { buildProjectionPlan, renderPlanSql } from '@landesrecht/runtime/projection.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const target = readOption('target') ?? 'plan';
const reset = process.argv.includes('--reset');
const only = readOption('jurisdiction');
if (only !== undefined && !isJurisdictionId(only)) {
  console.error(`Unbekannte Jurisdiktion: ${only}`);
  process.exit(1);
}
const jurisdictions: JurisdictionId[] = only && isJurisdictionId(only) ? [only] : [...JURISDICTION_IDS];
const root = resolveRepositoryRoot();
const runtimeDir = join(root, 'data', 'runtime');
const migrationsDir = join(root, 'data', 'd1');
await mkdir(runtimeDir, { recursive: true });

for (const jurisdiction of jurisdictions) {
  const records = await loadJurisdictionNorms(jurisdiction, root);
  const plan = buildProjectionPlan(records, { jurisdiction, full: true, now: new Date().toISOString() });
  const summary = `${D1_DATABASE_NAMES[jurisdiction]}: ${plan.stats.norms} Normen, ${plan.stats.versions} Fassungen, ${plan.stats.blocks} Blöcke (${plan.stats.blockParts} Teile), ${plan.stats.searchUnits} Sucheinheiten, ${plan.stats.statements} Anweisungen`;

  if (target === 'plan') {
    console.log(summary);
    continue;
  }
  if (target === 'remote-plan') {
    const file = join(runtimeDir, `${D1_DATABASE_NAMES[jurisdiction]}.sql`);
    await writeFile(file, `${renderPlanSql(plan)}\n`, 'utf8');
    console.log(`${summary}\n  → ${file}\n  Einspielen (manuell, nach Prüfung): npx wrangler d1 execute ${D1_DATABASE_NAMES[jurisdiction]} --remote --file ${file}`);
    continue;
  }
  if (target === 'local') {
    const file = join(runtimeDir, `${D1_DATABASE_NAMES[jurisdiction]}.sqlite`);
    if (reset) await rm(file, { force: true });
    const db = await openSqliteD1(file, { migrationsDir });
    const count = executePlan(db, plan);
    checkSearchIndexIntegrity(db);
    db.close();
    console.log(`${summary}\n  → ${file} (${count} Anweisungen ausgeführt)`);
    continue;
  }
  console.error(`Unbekanntes Ziel: ${target} (plan | local | remote-plan)`);
  process.exit(1);
}
