#!/usr/bin/env node
/**
 * Simulationsrechtsfortschreibung: Inventar des Sim-Quellarchivs, Konsolidierung, Verkündungen.
 *
 *   node scripts/import-simulation.ts help
 *   node scripts/import-simulation.ts inventory [--write] [--json]
 *   node scripts/import-simulation.ts r2-sync [--stage-only | --write] [--r2-transport wrangler|wrangler-api] [--verify readback|etag]
 *   node scripts/import-simulation.ts completeness [--write] [--jurisdiction <land>]
 *   node scripts/import-simulation.ts consolidate --jurisdiction <land> [--write] [--check] [--only <slug,…>]
 *
 * Ohne --write wird nichts geschrieben (Dry-run); r2-sync --stage-only schreibt Staging, Manifest und Bericht ohne Netz.
 */
import { runCli } from '@landesrecht/importer-simulation/cli.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
