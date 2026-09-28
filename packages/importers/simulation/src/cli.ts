/**
 * CLI der Simulationsrechtsfortschreibung (`scripts/import-simulation.ts`). Ohne `--write` wird nichts
 * geschrieben (Dry-run). Exit-Codes: 0 ok, 1 Fehler/Abweichung, 2 nicht implementiert.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { isJurisdictionId, JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { INVENTORY_DOC_PATH, INVENTORY_PATH, SIMULATION_DATA_DIR } from './common/paths.ts';
import { renderConsolidationLines, runConsolidation } from './consolidate/run.ts';
import { renderInventoryReport } from './inventory/report.ts';
import { scanArchive } from './inventory/scan.ts';

export const COMMANDS = ['inventory', 'consolidate', 'ledger-sync', 'r2-sync', 'completeness', 'help'] as const;
export type Command = (typeof COMMANDS)[number];

export interface CliOptions {
  command: Command;
  write: boolean;
  check: boolean;
  json: boolean;
  quiet: boolean;
  jurisdiction?: JurisdictionId;
  only?: string[];
  /** r2-sync: nur stagen (kein Netz), Transport, gleichzeitige Objekte, Prüfregime, Begrenzung, Staging-Verzeichnis. */
  stageOnly: boolean;
  r2Transport?: 'wrangler' | 'wrangler-api';
  concurrency?: number;
  verify?: 'readback' | 'etag';
  limit?: number;
  stagingDir?: string;
}

function positiveInteger(value: string | undefined, option: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value) throw new Error(`${option} erwartet eine positive ganze Zahl`);
  return parsed;
}

export function parseCliArguments(argv: readonly string[]): CliOptions {
  const [first, ...rest] = argv;
  const command = (first ?? 'help') as Command;
  if (!COMMANDS.includes(command)) throw new Error(`Unbekannter Befehl: ${first}. Befehle: ${COMMANDS.join(', ')}`);
  const options: CliOptions = { command, write: false, check: false, json: false, quiet: false, stageOnly: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const take = (): string => {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Option ${argument} braucht einen Wert`);
      index += 1;
      return value;
    };
    if (argument === '--write') options.write = true;
    else if (argument === '--check') options.check = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--quiet') options.quiet = true;
    else if (argument === '--stage-only') options.stageOnly = true;
    else if (argument === '--jurisdiction' || argument === '--only') {
      const value = take();
      if (argument === '--jurisdiction') {
        if (!isJurisdictionId(value)) throw new Error(`Unbekannte Jurisdiktion: ${value}. Zulässig: ${JURISDICTION_IDS.join(', ')}`);
        options.jurisdiction = value;
      } else options.only = value.split(',').map((entry) => entry.trim()).filter(Boolean);
    } else if (argument === '--r2-transport') {
      const transport = take();
      if (transport !== 'wrangler' && transport !== 'wrangler-api') throw new Error('--r2-transport erwartet wrangler|wrangler-api');
      options.r2Transport = transport;
    } else if (argument === '--verify') {
      const verify = take();
      if (verify !== 'readback' && verify !== 'etag') throw new Error('--verify erwartet readback|etag');
      options.verify = verify;
    } else if (argument === '--concurrency') options.concurrency = positiveInteger(take(), '--concurrency');
    else if (argument === '--limit') options.limit = positiveInteger(take(), '--limit');
    else if (argument === '--staging-dir') options.stagingDir = take();
    else throw new Error(`Unbekannte Option: ${argument}`);
  }
  if (options.command === 'consolidate') {
    if (!options.jurisdiction) throw new Error('consolidate braucht --jurisdiction <west|nsh|baywue>');
    if (options.write && options.check) throw new Error('--write und --check schließen sich aus');
    if (options.check && options.only) throw new Error('--check prüft immer den ganzen Bestand (kein --only)');
  }
  if (options.command === 'ledger-sync' && !options.jurisdiction) throw new Error('ledger-sync braucht --jurisdiction <west|nsh|baywue>');
  if (options.command === 'r2-sync' && options.write && options.stageOnly) throw new Error('--write und --stage-only schließen sich aus');
  return options;
}

const HELP = `Simulationsrechtsfortschreibung
  inventory [--write] [--json] [--quiet]   Archiv imports/ inventarisieren (Hash, Text, Vorsortierung);
                                           --write schreibt ${INVENTORY_PATH} und ${INVENTORY_DOC_PATH}
  consolidate --jurisdiction <j> [--write] [--check] [--only <slug,…>] [--json] [--quiet]
                                           Sim-Akte (${SIMULATION_DATA_DIR}/<j>/acts/) materialisieren und Rezepte
                                           (${SIMULATION_DATA_DIR}/<j>/amendments/<akt>/<ziel>.json) anwenden;
                                           --write schreibt nur neue Fassungen, additive meta/history und das
                                           Manifest ${SIMULATION_DATA_DIR}/<j>/consolidation-manifest.json;
                                           --check baut alles neu und vergleicht byteidentisch (Gate G4)
  ledger-sync --jurisdiction <j> [--write] [--json]
                                           Ereignisstatus in ${SIMULATION_DATA_DIR}/<j>/ledger.json mit dem Manifest
                                           abgleichen: pending → applied, sobald Akt und Rezept im Bestand stehen
                                           (review/blocked/not-promulgated bleiben; Widerspruch = Fehler)
  r2-sync [--stage-only | --write] [--r2-transport wrangler|wrangler-api] [--concurrency n]
          [--verify readback|etag] [--limit n] [--staging-dir pfad]
                                           Originaldateien des Inventars nach <jurisdiction>/simulation/<sha256>.<ext>
                                           in den Bucket landesrecht-quellen archivieren (nie überschreiben);
                                           --stage-only stagt nach .cache/simulation-r2-staging/ und schreibt
                                           ${SIMULATION_DATA_DIR}/r2-archive.json sowie data/audits/simulation/R2_ARCHIVE.*
                                           (kein Netz); --write lädt gestagte Objekte hoch (Wrangler-OAuth)
  completeness [--write] [--jurisdiction <j>] [--json]
                                           ${SIMULATION_DATA_DIR}/<j>/completeness.json lesen, Baseline- und Sim-Normen
                                           zählen; --write schreibt den Block simulation nach
                                           packages/legal-core/src/config/inventory-status.json
Ohne --write wird nichts in content/, data/, docs/ oder packages/ geschrieben (Ausnahme: r2-sync --stage-only schreibt
Staging, Manifest und Bericht, kein Netz); der Cache .cache/simulation/ wird immer befüllt.`;

export async function runCli(argv: readonly string[], io: { print: (line: string) => void; error: (line: string) => void } = { print: console.log, error: console.error }): Promise<number> {
  const options = parseCliArguments(argv);
  const root = resolveRepositoryRoot();
  if (options.command === 'help') {
    io.print(HELP);
    return 0;
  }
  if (options.command === 'inventory') {
    const inventory = await scanArchive(root, { log: options.quiet ? undefined : io.print });
    if (options.json) io.print(JSON.stringify(inventory, null, 2));
    else {
      io.print(`Inventar: ${inventory.totals.files} Dateien, ${inventory.totals.sources} Quellen (${inventory.totals.duplicateFiles} Dubletten) · ${Object.entries(inventory.totals.byJurisdiction).map(([jurisdiction, total]) => `${jurisdiction} ${total}`).join(', ')}`);
      io.print(`  Textebene: ${Object.entries(inventory.totals.byTextLayer).map(([layer, total]) => `${layer} ${total}`).join(', ')} · Dokumentart: ${Object.entries(inventory.totals.byDocumentType).map(([type, total]) => `${type} ${total}`).join(', ')}`);
      if (inventory.container.present) io.print(`  Archiv.zip: ${inventory.container.entries} Einträge; nur im Zip ${inventory.container.onlyInContainer?.length ?? 0}, nur im Ordner ${inventory.container.onlyInFolder?.length ?? 0}`);
    }
    if (!options.write) {
      io.print(`Dry-run: ${INVENTORY_PATH} und ${INVENTORY_DOC_PATH} nicht geschrieben (--write).`);
      return 0;
    }
    await mkdir(dirname(join(root, INVENTORY_PATH)), { recursive: true });
    await writeFile(join(root, INVENTORY_PATH), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
    await writeFile(join(root, INVENTORY_DOC_PATH), renderInventoryReport(inventory), 'utf8');
    io.print(`Geschrieben: ${INVENTORY_PATH}, ${INVENTORY_DOC_PATH}`);
    return 0;
  }
  if (options.command === 'consolidate') {
    const result = await runConsolidation({
      root,
      jurisdiction: options.jurisdiction!,
      mode: options.check ? 'check' : options.write ? 'write' : 'dry-run',
      only: options.only,
    });
    if (options.json) io.print(JSON.stringify({ ...result, files: result.files.map((file) => ({ path: file.path, status: file.status })) }, null, 2));
    else if (!options.quiet) for (const line of renderConsolidationLines(result)) io.print(line);
    else for (const line of [...result.errors.map((error) => `Fehler: ${error}`), ...result.checkProblems.map((problem) => `Abweichung: ${problem}`)]) io.error(line);
    return result.ok ? 0 : 1;
  }
  if (options.command === 'ledger-sync') {
    const { renderLedgerSyncLines, syncLedger } = await import('./ledger/sync.ts');
    const result = await syncLedger(root, options.jurisdiction!, { write: options.write });
    if (options.json) io.print(JSON.stringify(result, null, 2));
    else for (const line of renderLedgerSyncLines(result)) io.print(line);
    return result.errors.length > 0 ? 1 : 0;
  }
  if (options.command === 'r2-sync') {
    const { runR2Sync } = await import('./r2/command.ts');
    return runR2Sync({ write: options.write, stageOnly: options.stageOnly, ...(options.r2Transport ? { r2Transport: options.r2Transport } : {}), ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}), ...(options.verify ? { verify: options.verify } : {}), ...(options.limit !== undefined ? { limit: options.limit } : {}), ...(options.stagingDir ? { stagingDir: options.stagingDir } : {}) }, root, io);
  }
  if (options.command === 'completeness') {
    const { runCompleteness } = await import('./completeness/command.ts');
    return runCompleteness({ write: options.write, json: options.json, ...(options.jurisdiction ? { jurisdiction: options.jurisdiction } : {}) }, root, io);
  }
  return 2;
}
