/**
 * `r2-sync` des juris-SH-Adapters: Transport ausschließlich über die bestehende Wrangler-OAuth-Anmeldung (wie BayWü;
 * ein gesetztes `CLOUDFLARE_API_TOKEN` oder ein API-Token in der Anmeldedatei wird abgelehnt) und der Bericht
 * `data/audits/juris-sh/R2_STAGING.{json,md}`.
 */
import { join } from 'node:path';

import { writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { createWranglerApiR2Transport, createWranglerR2Transport, readWranglerAuthFile, WranglerAuthError, type R2Transport, type WranglerAuthConfig } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { AUDIT_DIR, R2_PREFIX } from '../common/constants.ts';
import { DEFAULT_STAGING_DIR, R2_SOURCES_BUCKET } from '../common/environment.ts';
import { ArchiveError } from './archive.ts';
import type { StageResult, SyncResult } from './sync.ts';

export const R2_REPORT_JSON_PATH = `${AUDIT_DIR}/R2_STAGING.json`;
export const R2_REPORT_MD_PATH = `${AUDIT_DIR}/R2_STAGING.md`;
/** Große Gesamtausgaben (bis rund 10 MB) brauchen mehr Zeit als der Standard. */
export const LARGE_OBJECT_TIMEOUT_MS = 180_000;

export async function readOAuthOnly(): Promise<WranglerAuthConfig> {
  const config = await readWranglerAuthFile();
  if (config.apiToken) throw new WranglerAuthError('rejected', 'Die Wrangler-Anmeldedatei führt ein API-Token statt einer OAuth-Anmeldung; der NSH-Sync nutzt ausschließlich OAuth (npx wrangler login)');
  return { ...(config.oauthToken ? { oauthToken: config.oauthToken } : {}), ...(config.expirationTime ? { expirationTime: config.expirationTime } : {}) };
}

export function createOAuthTransport(name: 'wrangler' | 'wrangler-api', root: string, env: Record<string, string | undefined> = process.env): R2Transport {
  if (env.CLOUDFLARE_API_TOKEN?.trim()) throw new ArchiveError('guard', 'CLOUDFLARE_API_TOKEN ist gesetzt – der NSH-Sync nutzt ausschließlich die Wrangler-OAuth-Anmeldung; Variable entfernen und erneut starten');
  const cwd = join(root, 'apps', 'web');
  if (name === 'wrangler-api') return createWranglerApiR2Transport({ bucket: R2_SOURCES_BUCKET, cwd, env, readToken: readOAuthOnly, timeoutMs: LARGE_OBJECT_TIMEOUT_MS });
  return createWranglerR2Transport({ bucket: R2_SOURCES_BUCKET, cwd });
}

export interface R2ReportInput {
  mode: 'dry-run' | 'stage-only' | 'write';
  stage: StageResult;
  sync?: SyncResult;
}

export async function writeR2Report(root: string, input: R2ReportInput): Promise<string[]> {
  const report = {
    schemaVersion: 'juris-sh-r2-staging/1',
    bucket: R2_SOURCES_BUCKET,
    prefix: `${R2_PREFIX}/`,
    stagingDir: DEFAULT_STAGING_DIR,
    mode: input.mode,
    stage: { ...input.stage, missingCache: input.stage.missingCache.slice(0, 200), conflicts: input.stage.conflicts.slice(0, 200) },
    ...(input.sync ? { sync: { ...input.sync, missingStaging: input.sync.missingStaging.slice(0, 200) } } : {}),
  };
  const lines = [
    '# R2-Staging juris Schleswig-Holstein',
    '',
    `Erzeugt von \`node scripts/import-juris-sh.ts r2-sync${input.mode === 'stage-only' ? ' --stage-only' : input.mode === 'write' ? ' --write' : ''}\`. Bucket \`${R2_SOURCES_BUCKET}\`, Präfix \`${R2_PREFIX}/\`, Staging \`${DEFAULT_STAGING_DIR}/\` (nicht versioniert).`,
    '',
    '| Kennzahl | Wert |',
    '| --- | --- |',
    `| übernommene Normen | ${input.stage.entries} |`,
    `| Rohquellen (PDF) | ${input.stage.objects} (${Math.round(input.stage.bytes / 1024 / 1024)} MB) |`,
    `| neu gestagt | ${input.stage.staged} |`,
    `| bereits gestagt | ${input.stage.alreadyStaged} |`,
    `| bereits in R2 (uploaded/verified) | ${input.stage.alreadyArchived} |`,
    `| ohne Cache | ${input.stage.missingCache.length} |`,
    `| Konflikte | ${input.stage.conflicts.length} |`,
    ...(input.sync ? [`| hochgeladen und rückgelesen | ${input.sync.uploaded} |`, `| in R2 bereits vorhanden (gleicher Inhalt) | ${input.sync.alreadyPresent} |`, `| Normen vollständig geprüft | ${input.sync.entriesVerified} |`] : ['| Upload | nicht ausgeführt (kein Netz) |']),
    '',
    'Upload (nur mit Wrangler-OAuth-Anmeldung, fortsetzbar): `npm run import:juris-sh:r2-sync -- --write` (optional `--r2-transport wrangler-api --concurrency 8`).',
    '',
  ];
  const written: string[] = [];
  if (await writeJsonAtomic(join(root, R2_REPORT_JSON_PATH), report)) written.push(R2_REPORT_JSON_PATH);
  if (await writeFileAtomic(join(root, R2_REPORT_MD_PATH), `${lines.join('\n')}\n`)) written.push(R2_REPORT_MD_PATH);
  return written;
}
