#!/usr/bin/env node
/**
 * RECHT.NRW-Importer (Land Nordrhein-Westfalen → Land Westdeutschland).
 *
 *   node scripts/import-recht-nrw.ts inspect --url <url>
 *   node scripts/import-recht-nrw.ts import --url <url> [--write]
 *   node scripts/import-recht-nrw.ts sample [--write]
 *   node scripts/import-recht-nrw.ts audit
 *
 * Ohne --write wird nichts geschrieben (Dry-run). Details: docs/RECHT_NRW_IMPORT.md
 */
import { runCli } from '@landesrecht/importer-recht-nrw/cli.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
