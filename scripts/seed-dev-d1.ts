#!/usr/bin/env node
/**
 * Lokale Miniflare-D1 für `astro dev` und `wrangler dev` befüllen.
 *
 * Astro 7 führt Worker-Routen auch im Dev-Server in workerd aus; die D1-Bindings aus
 * apps/web/wrangler.jsonc zeigen dort auf lokale, zunächst leere Datenbanken unter
 * apps/web/.wrangler/state. Dieses Skript rendert je Jurisdiktion den vollständigen
 * Projektionsplan als SQL und spielt Schema und Plan mit `wrangler d1 execute --local` ein.
 * Es berührt nie eine Remote-Datenbank (kein --remote, keine Zugangsdaten nötig). Synthetische
 * Testfixtures (tests/fixtures/content/) werden nie eingespielt.
 *
 *   node scripts/seed-dev-d1.ts [--jurisdiction west]
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { JURISDICTION_IDS, isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { isSyntheticFixtureNorm } from '@landesrecht/legal-core/lib/schema.ts';
import { D1_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { buildProjectionPlan, renderPlanSql } from '@landesrecht/runtime/projection.ts';
import { listMigrations } from '@landesrecht/runtime/sqlite-d1.ts';

const root = resolveRepositoryRoot();
const appDir = join(root, 'apps', 'web');
const runtimeDir = join(root, 'data', 'runtime');
const onlyIndex = process.argv.indexOf('--jurisdiction');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
const jurisdictions: JurisdictionId[] = only && isJurisdictionId(only) ? [only] : [...JURISDICTION_IDS];

await mkdir(runtimeDir, { recursive: true });
const migrations = await listMigrations(join(root, 'data', 'd1'));

function wranglerExecute(database: string, file: string): void {
  execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--local', '--config', 'wrangler.jsonc', '--file', file, '--yes'], {
    cwd: appDir,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'error' },
  });
}

for (const jurisdiction of jurisdictions) {
  const database = D1_DATABASE_NAMES[jurisdiction];
  const records = await loadJurisdictionNorms(jurisdiction, root);
  const fixtures = records.filter((record) => isSyntheticFixtureNorm(record.meta));
  if (fixtures.length > 0) throw new Error(`${jurisdiction}: synthetische Testfixtures im Produktionsbestand (${fixtures.map((record) => record.meta.slug).join(', ')})`);
  const plan = buildProjectionPlan(records, { jurisdiction, full: true, now: new Date().toISOString() });
  const planFile = join(runtimeDir, `${database}.dev.sql`);
  await writeFile(planFile, `${renderPlanSql(plan)}\n`, 'utf8');
  for (const migration of migrations) wranglerExecute(database, migration);
  wranglerExecute(database, planFile);
  console.log(`${database}: ${plan.stats.norms} Normen, ${plan.stats.versions} Fassungen, ${plan.stats.searchUnits} Sucheinheiten → lokale Miniflare-D1 (apps/web/.wrangler/state)`);
}
