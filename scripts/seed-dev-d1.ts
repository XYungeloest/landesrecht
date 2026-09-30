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
 * Idempotent und schnell: Trägt die lokale D1 bereits den Fingerabdruck des aktuellen Bestands (`projection_fingerprint`)
 * und sind die Migrationen unverändert (Stempel `data/runtime/<db>.dev.stamp`, gitignored), wird das Land übersprungen –
 * ein unveränderter `npm run dev` startet in Sekunden statt Minuten. `--force` spielt immer neu ein. Ost hat keine
 * eigene D1 (OstRecht upstream); lokal ist Ost ohne OstRecht-D1 `unavailable-local` (docs/MAINTENANCE.md).
 *
 *   node scripts/seed-dev-d1.ts [--jurisdiction west] [--force]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTION_IDS, JURISDICTIONS, isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms, loadJurisdictionPublications } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { isSyntheticFixtureNorm } from '@landesrecht/legal-core/lib/schema.ts';
import { D1_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { buildProjectionPlan, corpusFingerprint, renderPlanSql, RUNTIME_META_KEYS } from '@landesrecht/runtime/projection.ts';
import { isAlreadyAppliedMigrationError, listMigrations } from '@landesrecht/runtime/sqlite-d1.ts';

const root = resolveRepositoryRoot();
const appDir = join(root, 'apps', 'web');
const runtimeDir = join(root, 'data', 'runtime');
const onlyIndex = process.argv.indexOf('--jurisdiction');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
const force = process.argv.includes('--force');
// Nur Länder mit eigener Projektion; Ost liest die OstRecht-D1 (`runtimeSource: 'ostrecht-d1'`), es gibt keine eigene Ost-D1.
const jurisdictions: JurisdictionId[] = (only && isJurisdictionId(only) ? [only] : [...JURISDICTION_IDS]).filter((id) => JURISDICTIONS[id].runtimeSource === 'landesrecht-d1');

await mkdir(runtimeDir, { recursive: true });
const migrations = await listMigrations(join(root, 'data', 'd1'));

const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'error' };

function wranglerExecute(database: string, file: string, options: { migration?: boolean } = {}): void {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--local', '--config', 'wrangler.jsonc', '--file', file, '--yes'], { cwd: appDir, stdio: ['ignore', 'ignore', options.migration ? 'pipe' : 'inherit'], env: WRANGLER_ENV });
  } catch (error) {
    // Migration mit `ALTER TABLE … ADD COLUMN` auf einer Datenbank, die die Spalte schon trägt: bereits angewandt.
    if (options.migration && isAlreadyAppliedMigrationError(String((error as { stderr?: Buffer }).stderr ?? ''))) return;
    throw new Error(`Lokale D1 ${database}: wrangler d1 execute --local mit ${file} fehlgeschlagen (${(error as Error).message.split('\n')[0]}). Nur lokal, keine Remote-Datenbank betroffen; erneut mit --force versuchen.`);
  }
}

/** Fingerabdruck der lokalen D1 (`law_runtime_meta`); `undefined`, wenn nicht befüllt oder nicht lesbar. Ohne
 * `WRANGLER_LOG=error`: Wrangler gibt das JSON-Ergebnis über seinen Logger aus. */
function localFingerprint(database: string): string | undefined {
  try {
    const output = execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--local', '--config', 'wrangler.jsonc', '--json', '--command', `SELECT value FROM law_runtime_meta WHERE key = '${RUNTIME_META_KEYS.projectionFingerprint}'`], { cwd: appDir, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, encoding: 'utf8' });
    const rows = (JSON.parse(output) as Array<{ results?: Array<{ value?: string }> }>)[0]?.results ?? [];
    return rows[0]?.value;
  } catch {
    return undefined;
  }
}

async function readStamp(path: string): Promise<string | undefined> {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch {
    return undefined;
  }
}

const migrationsHash = createHash('sha256');
for (const migration of migrations) migrationsHash.update(`${migration}\n${await readFile(migration, 'utf8')}\n`);
const migrationsFingerprint = migrationsHash.digest('hex').slice(0, 16);

for (const jurisdiction of jurisdictions) {
  const database = D1_DATABASE_NAMES[jurisdiction];
  const records = await loadJurisdictionNorms(jurisdiction, root);
  const fixtures = records.filter((record) => isSyntheticFixtureNorm(record.meta));
  if (fixtures.length > 0) throw new Error(`${jurisdiction}: synthetische Testfixtures im Produktionsbestand (${fixtures.map((record) => record.meta.slug).join(', ')})`);
  const publications = await loadJurisdictionPublications(jurisdiction, root);
  const fingerprint = corpusFingerprint(records, EDITORIAL_REFERENCE_DATE, publications);
  const stampFile = join(runtimeDir, `${database}.dev.stamp`);
  const stamp = `${fingerprint} ${migrationsFingerprint}`;
  if (!force && (await readStamp(stampFile)) === stamp && localFingerprint(database) === fingerprint) {
    console.log(`${database}: lokale D1 aktuell (Fingerabdruck ${fingerprint}) – übersprungen (--force spielt neu ein)`);
    continue;
  }
  const plan = buildProjectionPlan(records, { jurisdiction, full: true, now: new Date().toISOString(), publications });
  const planFile = join(runtimeDir, `${database}.dev.sql`);
  await writeFile(planFile, `${renderPlanSql(plan)}\n`, 'utf8');
  for (const migration of migrations) wranglerExecute(database, migration, { migration: true });
  wranglerExecute(database, planFile);
  await writeFile(stampFile, `${stamp}\n`, 'utf8');
  console.log(`${database}: ${plan.stats.norms} Normen, ${plan.stats.versions} Fassungen, ${plan.stats.searchUnits} Sucheinheiten, ${plan.stats.publications} Verkündungen → lokale Miniflare-D1 (apps/web/.wrangler/state)`);
}
if (!only) console.log('Ost: keine eigene lokale D1 (OstRecht ist vorgelagertes Quellsystem); ohne lokale OstRecht-D1 meldet der Dev-Server Ost als unavailable-local (503 für Ost-Anfragen).');
