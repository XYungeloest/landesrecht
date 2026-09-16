import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTION_IDS, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadAllNorms, loadJurisdictionPublications, loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { isSyntheticFixtureNorm } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion, resolveVersionAt } from '@landesrecht/legal-core/lib/versions.ts';
import { D1_BINDINGS, D1_DATABASE_NAMES, R2_SOURCES_BINDING, R2_SOURCES_BUCKET_NAME } from '@landesrecht/runtime/bindings.ts';

const root = resolveRepositoryRoot();
/** Synthetischer Testbestand: tests/fixtures/content/ (nie Teil von content/, Projektion oder Build). */
const fixtureRoot = join(root, 'tests', 'fixtures');

function parseJsonc(text: string): unknown {
  return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, ''));
}

describe('Synthetischer Testbestand (tests/fixtures/content)', () => {
  it('enthält je Jurisdiktion mindestens eine gekennzeichnete Norm und West zwei Fassungen', async () => {
    const norms = await loadAllNorms(fixtureRoot);
    for (const jurisdiction of JURISDICTION_IDS) expect(norms.some((record) => record.meta.jurisdiction === jurisdiction), jurisdiction).toBe(true);
    for (const record of norms) expect(record.meta.dataset, record.meta.slug).toBe('synthetic-fixture');
    const west = await loadNorm('west', 'testfixture-schulgesetz-west', fixtureRoot);
    expect(west.versions.map((version) => version.versionId)).toEqual(['2023-12-01', '2026-05-01']);
    expect(west.versions[0]!.sourceValidFrom).toBe('2023-08-01');
    expect(west.versions[0]!.sourceValidTo).toBe('2024-01-31');
    expect(west.versions[0]!.simulationValidFrom).toBe(SIMULATION_BASELINE_DATE);
    expect(getApplicableVersion(west, EDITORIAL_REFERENCE_DATE).versionId).toBe('2026-05-01');
    expect(resolveVersionAt(west, '2024-01-01')?.versionId).toBe('2023-12-01');
    for (const record of norms) expect(record.meta.id).toBe(`${record.meta.jurisdiction}:${record.meta.slug}`);
  });

  it('verknüpft Verkündungen mit gespeicherten Fassungen', async () => {
    const publications = await loadJurisdictionPublications('west', fixtureRoot);
    expect(publications).toHaveLength(1);
    expect(publications[0]!.entries[0]).toMatchObject({ normSlug: 'testfixture-schulgesetz-west', versionId: '2026-05-01' });
  });

  it('lehnt Normen im falschen Jurisdiktionsverzeichnis ab', async () => {
    await expect(loadNorm('nsh', 'testfixture-schulgesetz-west', fixtureRoot)).rejects.toThrow();
  });
});

describe('Produktionsbestand (content/)', () => {
  it('enthält keine synthetischen Testfixtures, nur übernommene Normen mit Quellkennung', async () => {
    const norms = await loadAllNorms(root);
    expect(norms.filter((record) => isSyntheticFixtureNorm(record.meta)).map((record) => record.meta.slug)).toEqual([]);
    for (const record of norms.filter((entry) => entry.meta.jurisdiction === 'west')) expect(record.meta.externalIdentifiers.some((identifier) => identifier.system === 'recht-nrw'), record.meta.slug).toBe(true);
    for (const jurisdiction of JURISDICTION_IDS) expect(await loadJurisdictionPublications(jurisdiction, root)).toEqual([]);
  });
});

describe('Wrangler-Konfiguration', () => {
  it('bindet je Jurisdiktion eine D1-Datenbank und ein R2-Quellenarchiv, ohne echte IDs', async () => {
    const config = parseJsonc(await readFile(join(root, 'apps', 'web', 'wrangler.jsonc'), 'utf8')) as {
      name: string;
      account_id?: string;
      d1_databases: Array<{ binding: string; database_name: string; database_id: string }>;
      r2_buckets: Array<{ binding: string; bucket_name: string }>;
      env: { staging: { d1_databases: Array<{ binding: string; database_name: string; database_id: string }>; r2_buckets: Array<{ binding: string; bucket_name: string }>; vars: { APP_ENV: string } } };
    };
    expect(config.name).toBe('landesrecht');
    expect(config.account_id).toBeUndefined();
    for (const jurisdiction of JURISDICTION_IDS) {
      const binding = config.d1_databases.find((entry) => entry.binding === D1_BINDINGS[jurisdiction]);
      expect(binding?.database_name, jurisdiction).toBe(D1_DATABASE_NAMES[jurisdiction]);
      expect(binding?.database_id).toMatch(/^00000000-0000-4000-8000-0000000000\d\d$/u);
      const staging = config.env.staging.d1_databases.find((entry) => entry.binding === D1_BINDINGS[jurisdiction]);
      expect(staging?.database_name).toBe(`${D1_DATABASE_NAMES[jurisdiction]}-staging`);
      expect(staging?.database_id).not.toBe(binding?.database_id);
    }
    expect(config.r2_buckets).toEqual([{ binding: R2_SOURCES_BINDING, bucket_name: R2_SOURCES_BUCKET_NAME }]);
    expect(config.env.staging.r2_buckets[0]!.bucket_name).toBe(`${R2_SOURCES_BUCKET_NAME}-staging`);
    expect(config.env.staging.vars.APP_ENV).toBe('staging');
  });
});

describe('GitLab-CI', () => {
  it('führt Installation, Prüfung, Tests und Build aus und deployt nur geschützt', async () => {
    const pipeline = await readFile(join(root, '.gitlab-ci.yml'), 'utf8');
    for (const command of ['npm ci', 'npm run check', 'npm run test', 'npm run build']) expect(pipeline).toContain(command);
    expect(pipeline).toContain('CLOUDFLARE_API_TOKEN');
    expect(pipeline).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(pipeline).toMatch(/when:\s*manual/u);
    expect(pipeline).not.toMatch(/api[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/u);
  });
});
