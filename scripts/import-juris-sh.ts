#!/usr/bin/env node
/**
 * juris-SH-Importer (Land Schleswig-Holstein → Land Niedersachsen-Holstein, `nsh`).
 *
 *   node scripts/import-juris-sh.ts help [befehl]     vollständige Hilfe (auch: <befehl> --help)
 *   node scripts/import-juris-sh.ts review [--area landesrecht|vwv|events] [--json]
 *   node scripts/import-juris-sh.ts review --decide <id> --status <s> --reason "<text>" [--write]
 *   node scripts/import-juris-sh.ts enumerate | sample | bulk | audit | coverage | readiness |
 *                                   search-audit | reconstruction-queue | r2-sync | events
 *
 * Ohne --write wird nichts geschrieben (Dry-run). Befehle, deren Fachlogik noch nicht existiert, melden
 * das ausdrücklich und enden mit Exit 2. Exit-Codes: 0 ok, 1 Fehler/Abweichung, 2 noch nicht
 * implementiert bzw. systemischer Abbruch.
 */
import { runCli } from '@landesrecht/importer-juris-sh/cli.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
