#!/usr/bin/env node
/**
 * RECHT.NRW-Importer (Land Nordrhein-Westfalen → Land Westdeutschland).
 *
 *   node scripts/import-recht-nrw.ts help [befehl]        vollständige Hilfe (auch: <befehl> --help)
 *   node scripts/import-recht-nrw.ts inspect --url <url>
 *   node scripts/import-recht-nrw.ts import --url <url> [--write]
 *   node scripts/import-recht-nrw.ts sample [--area lrgv|lrmb] [--write]
 *   node scripts/import-recht-nrw.ts enumerate --area lrgv|lrmb [--write]
 *   node scripts/import-recht-nrw.ts bulk --area lrgv|lrmb [--write] [--resume] …
 *   node scripts/import-recht-nrw.ts r2-sync [--write] [--r2-transport wrangler|s3|wrangler-api] [--concurrency n] [--verify readback|etag]
 *   node scripts/import-recht-nrw.ts coverage | review | reconstruction-queue | search-audit | readiness | audit
 *
 * Ohne --write wird nichts geschrieben (Dry-run). Details: docs/RECHT_NRW_IMPORT.md, docs/RECHT_NRW_BULK_IMPORT.md,
 * docs/RECHT_NRW_BULK_READINESS.md. Exit-Codes: 0 ok, 1 Fehler/Abweichung, 2 systemischer Abbruch, 130 Abbruchsignal.
 */
import { runCli } from '@landesrecht/importer-recht-nrw/cli.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
