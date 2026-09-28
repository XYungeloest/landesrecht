/**
 * `r2-sync` der Simulationsrechtsfortschreibung: Inventar lesen, Originaldateien stagen, optional nach R2
 * übertragen (nur über die Wrangler-OAuth-Anmeldung wie NSH/BayWü: ein gesetztes `CLOUDFLARE_API_TOKEN` oder ein
 * API-Token in der Anmeldedatei wird abgelehnt) und den Bericht `data/audits/simulation/R2_ARCHIVE.{json,md}` schreiben.
 */
import { join } from 'node:path';

import { writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { createWranglerApiR2Transport, createWranglerR2Transport, readWranglerAuthFile, WranglerAuthError, type R2Transport, type WranglerAuthConfig } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { INVENTORY_PATH } from '../common/paths.ts';
import { INVENTORY_SCHEMA, type SourceInventory } from '../inventory/scan.ts';
import { ArchiveError, guardTransport, R2_SOURCES_BUCKET } from './archive.ts';
import { R2_ARCHIVE_MANIFEST_PATH, readArchiveManifest, type R2ArchiveManifest } from './manifest.ts';
import { DEFAULT_STAGING_DIR, stageSources, summarizeManifest, syncStaged, type StageResult, type SyncResult } from './sync.ts';

export const AUDIT_DIR = 'data/audits/simulation';
export const R2_REPORT_JSON_PATH = `${AUDIT_DIR}/R2_ARCHIVE.json`;
export const R2_REPORT_MD_PATH = `${AUDIT_DIR}/R2_ARCHIVE.md`;
/** Gesamtausgaben bis rund 40 MB brauchen mehr Zeit als der Standard des HTTP-Transports. */
export const LARGE_OBJECT_TIMEOUT_MS = 180_000;

export async function readOAuthOnly(): Promise<WranglerAuthConfig> {
  const config = await readWranglerAuthFile();
  if (config.apiToken) throw new WranglerAuthError('rejected', 'Die Wrangler-Anmeldedatei führt ein API-Token statt einer OAuth-Anmeldung; der Sim-Archiv-Sync nutzt ausschließlich OAuth (npx wrangler login)');
  return { ...(config.oauthToken ? { oauthToken: config.oauthToken } : {}), ...(config.expirationTime ? { expirationTime: config.expirationTime } : {}) };
}

export function createOAuthTransport(name: 'wrangler' | 'wrangler-api', root: string, env: Record<string, string | undefined> = process.env): R2Transport {
  if (env.CLOUDFLARE_API_TOKEN?.trim()) throw new ArchiveError('guard', 'CLOUDFLARE_API_TOKEN ist gesetzt – der Sim-Archiv-Sync nutzt ausschließlich die Wrangler-OAuth-Anmeldung; Variable entfernen und erneut starten');
  const cwd = join(root, 'apps', 'web');
  if (name === 'wrangler-api') return createWranglerApiR2Transport({ bucket: R2_SOURCES_BUCKET, cwd, env, readToken: readOAuthOnly, timeoutMs: LARGE_OBJECT_TIMEOUT_MS });
  return createWranglerR2Transport({ bucket: R2_SOURCES_BUCKET, cwd });
}

/** Das versionierte Inventar; ohne Inventar gibt es nichts zu archivieren (Fehler, kein leerer Lauf). */
export async function readSourceInventory(root: string): Promise<SourceInventory> {
  const inventory = await readJsonFile<SourceInventory>(join(root, INVENTORY_PATH));
  if (!inventory) throw new ArchiveError('guard', `${INVENTORY_PATH} fehlt – zuerst npm run import:simulation:inventory -- --write`);
  if (inventory.schemaVersion !== INVENTORY_SCHEMA || !Array.isArray(inventory.sources)) throw new ArchiveError('guard', `${INVENTORY_PATH}: Schema ${INVENTORY_SCHEMA} erwartet`);
  return inventory;
}

export interface R2ReportInput {
  mode: 'dry-run' | 'stage-only' | 'write';
  stage: StageResult;
  sync?: SyncResult;
  manifest: R2ArchiveManifest;
  now?: () => Date;
}

export async function writeR2Report(root: string, input: R2ReportInput): Promise<string[]> {
  const byJurisdiction = summarizeManifest(input.manifest);
  const report = {
    schemaVersion: 'landesrecht-simulation-r2-archive-report/1',
    bucket: R2_SOURCES_BUCKET,
    prefix: '<jurisdiction>/simulation/',
    stagingDir: DEFAULT_STAGING_DIR,
    manifest: R2_ARCHIVE_MANIFEST_PATH,
    mode: input.mode,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    stage: { ...input.stage, missingCache: input.stage.missingCache.slice(0, 200), conflicts: input.stage.conflicts.slice(0, 200) },
    ...(input.sync ? { sync: { ...input.sync, missingStaging: input.sync.missingStaging.slice(0, 200) } } : {}),
    objects: { total: input.manifest.objects.length, staged: input.manifest.objects.filter((object) => object.status === 'staged').length, verified: input.manifest.objects.filter((object) => object.status === 'verified').length, byJurisdiction },
  };
  const lines = [
    '# R2-Archiv der Sim-Rechtsquellen',
    '',
    `Erzeugt von \`node scripts/import-simulation.ts r2-sync${input.mode === 'stage-only' ? ' --stage-only' : input.mode === 'write' ? ' --write' : ''}\` am ${report.generatedAt.slice(0, 10)}. Bucket \`${R2_SOURCES_BUCKET}\`, Schlüssel \`<jurisdiction>/simulation/<sha256>.<ext>\` (+ \`.envelope.json\`), Staging \`${DEFAULT_STAGING_DIR}/\` (nicht versioniert), Manifest \`${R2_ARCHIVE_MANIFEST_PATH}\`.`,
    '',
    '| Kennzahl | Wert |',
    '| --- | --- |',
    `| Quellen im Inventar | ${input.stage.sources} (${Math.round(input.stage.bytes / 1024 / 1024)} MB) |`,
    `| neu gestagt | ${input.stage.staged} |`,
    `| bereits gestagt | ${input.stage.alreadyStaged} |`,
    `| bereits in R2 (verified) | ${input.stage.alreadyArchived} |`,
    `| ohne Cachekopie | ${input.stage.missingCache.length} |`,
    `| Konflikte | ${input.stage.conflicts.length} |`,
    ...(input.sync ? [`| hochgeladen | ${input.sync.uploaded} |`, `| in R2 bereits vorhanden (gleicher Inhalt) | ${input.sync.alreadyPresent} |`, `| nachgeprüft (${input.sync.verification}) | ${input.sync.verified} |`, `| Staging fehlt | ${input.sync.missingStaging.length} |`] : ['| Upload | nicht ausgeführt (kein Netz) |']),
    '',
    '| Jurisdiktion | gestagt | nachgeprüft |',
    '| --- | ---: | ---: |',
    ...Object.entries(byJurisdiction).map(([jurisdiction, counts]) => `| ${jurisdiction} | ${counts.staged} | ${counts.verified} |`),
    '',
    ...(input.stage.conflicts.length > 0 ? ['## Konflikte', '', ...input.stage.conflicts.slice(0, 50).map((line) => `- ${line}`), ''] : []),
    ...(input.stage.missingCache.length > 0 ? ['## Ohne Cachekopie', '', ...input.stage.missingCache.slice(0, 50).map((line) => `- ${line}`), ''] : []),
    'Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:simulation:r2-sync -- --write [--r2-transport wrangler-api --concurrency 16 --verify etag]`.',
    '',
  ];
  const written: string[] = [];
  if (await writeJsonAtomic(join(root, R2_REPORT_JSON_PATH), report)) written.push(R2_REPORT_JSON_PATH);
  if (await writeFileAtomic(join(root, R2_REPORT_MD_PATH), `${lines.join('\n')}\n`)) written.push(R2_REPORT_MD_PATH);
  return written;
}

export interface R2SyncCommandOptions {
  write: boolean;
  stageOnly: boolean;
  r2Transport?: 'wrangler' | 'wrangler-api';
  concurrency?: number;
  verify?: 'readback' | 'etag';
  limit?: number;
  stagingDir?: string;
  cacheDir?: string;
}

export interface Io {
  print: (line: string) => void;
  error: (line: string) => void;
}

/** Ablauf des Befehls; der Transport wird nur für `--write` erzeugt (kein Netz sonst). */
export async function runR2Sync(options: R2SyncCommandOptions, root: string, io: Io, transportFactory: (name: 'wrangler' | 'wrangler-api') => R2Transport = (name) => createOAuthTransport(name, root)): Promise<number> {
  const inventory = await readSourceInventory(root);
  const manifest = await readArchiveManifest(root);
  const write = options.write || options.stageOnly;
  const stage = await stageSources({ root, inventory, manifest, write, ...(options.stagingDir ? { stagingDir: options.stagingDir } : {}), ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}), log: io.print });
  const mode = options.write ? 'write' : options.stageOnly ? 'stage-only' : 'dry-run';
  if (stage.conflicts.length > 0 || stage.missingCache.length > 0) {
    for (const line of [...stage.conflicts, ...stage.missingCache].slice(0, 20)) io.error(`  ! ${line}`);
    io.error('Staging mit Befunden – kein Upload.');
    if (write) await writeR2Report(root, { mode, stage, manifest });
    return 1;
  }
  if (!options.write) {
    if (options.stageOnly) {
      const written = await writeR2Report(root, { mode, stage, manifest });
      io.print(`Gestagt (kein Netz). Manifest: ${R2_ARCHIVE_MANIFEST_PATH}. Bericht: ${written.join(', ') || 'unverändert'}. Upload: npm run import:simulation:r2-sync -- --write`);
    } else io.print('Dry-run: nichts geschrieben, kein Netz. --stage-only stagt, --write stagt und lädt hoch.');
    return 0;
  }
  const transport = guardTransport(transportFactory(options.r2Transport ?? 'wrangler'));
  const sync = await syncStaged({ root, manifest, transport, ...(options.stagingDir ? { stagingDir: options.stagingDir } : {}), ...(options.limit !== undefined ? { limit: options.limit } : {}), ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}), ...(options.verify ? { verification: options.verify } : {}), log: io.print });
  const written = await writeR2Report(root, { mode, stage, sync, manifest });
  io.print(`R2: offen ${sync.pending} · hochgeladen ${sync.uploaded} · vorhanden ${sync.alreadyPresent} · nachgeprüft ${sync.verified} (${sync.verification}) · Staging fehlt ${sync.missingStaging.length}. Bericht: ${written.join(', ') || 'unverändert'}`);
  return sync.missingStaging.length === 0 ? 0 : 1;
}
