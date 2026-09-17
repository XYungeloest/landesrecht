import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
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
      // Echte D1-Kennungen sind Konfigurationswerte, keine Zugangsdaten: gültige UUID (oder Platzhalter vor dem Anlegen).
      expect(binding?.database_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
      const staging = config.env.staging.d1_databases.find((entry) => entry.binding === D1_BINDINGS[jurisdiction]);
      expect(staging?.database_name).toBe(`${D1_DATABASE_NAMES[jurisdiction]}-staging`);
      expect(staging?.database_id).not.toBe(binding?.database_id);
    }
    expect(config.r2_buckets).toEqual([{ binding: R2_SOURCES_BINDING, bucket_name: R2_SOURCES_BUCKET_NAME }]);
    expect(config.env.staging.r2_buckets[0]!.bucket_name).toBe(`${R2_SOURCES_BUCKET_NAME}-staging`);
    expect(config.env.staging.vars.APP_ENV).toBe('staging');
  });
});

describe('Ignorierte lokale Zustände und Geheimnisse', () => {
  it('.gitignore deckt Cache, Staging, lokale D1, Apply-Protokolle, Temp-Dateien, Wrangler-Geheimnisse und env ab', async () => {
    const ignore = await readFile(join(root, '.gitignore'), 'utf8');
    for (const pattern of ['.cache/', 'data/runtime/*.sqlite', 'data/runtime/d1-batches/', 'data/runtime/projection-state-*.json', '.tmp-*', '.old-norm-*', '*.log', '.env', '.env.*', '!.env.example', '.dev.vars', '.dev.vars.*', '.wrangler/', '**/.wrangler/config/']) {
      expect(ignore.split('\n'), pattern).toContain(pattern);
    }
    // git selbst bestätigt die Wirkung für die wichtigsten lokalen Pfade.
    const probes = ['.cache/recht-nrw/x.bin', '.cache/recht-nrw-r2-staging/west/x.html', 'data/runtime/landesrecht-west.sqlite', 'data/runtime/d1-batches/landesrecht-west/apply-state.json', 'content/norms/west/.tmp-norm-x', 'apps/web/.dev.vars', '.env.local', 'apps/web/.wrangler/config/default.toml', 'r2-api-debug.log'];
    const output = execFileSync('git', ['check-ignore', ...probes], { cwd: root, encoding: 'utf8' });
    expect(output.trim().split('\n').sort()).toEqual([...probes].sort());
  });

  it('enthält keine Zugangsdaten in versionierten Dateien (statischer Secret-Scan)', async () => {
    const git = (args: string[]): string[] => {
      try {
        return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\0|\n/u).filter(Boolean);
      } catch (error) {
        if ((error as { status?: number }).status === 1) return [];
        throw error;
      }
    };
    // Kandidaten schnell über git grep (nur Textdateien), dann genaue Prüfung je Zeile. Werte in Meldungen: nur Pfad und Art.
    const candidates = git(['grep', '-I', '-i', '-l', '-E', '-e', 'api[_-]?token|oauth[_-]?token|refresh[_-]?token|secret[_-]?access[_-]?key|access[_-]?key[_-]?id|Bearer|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY|^expiration_time', '--', '.', ':!package-lock.json']);
    const patterns: Array<[string, RegExp]> = [
      // Zuweisung eines Tokenwerts (in Anführungszeichen beliebig, unquotiert nur ohne Punkt – Bezeichnerpfade wie env.X zählen nicht).
      ['API-/OAuth-Token-Zuweisung', /(?:^|[^A-Za-z0-9_])(?:api[_-]?token|oauth[_-]?token|refresh[_-]?token|secret[_-]?access[_-]?key|access[_-]?key[_-]?id)\s*[:=]\s*(?:["'][A-Za-z0-9_/+=.~-]{20,}["']|[A-Za-z0-9_/+=~-]{20,}(?![A-Za-z0-9_.]))/iu],
      ['Bearer-Token', /\bBearer\s+[A-Za-z0-9_.~+/=-]{24,}/u],
      ['AWS-Zugangsschlüssel', /\bAKIA[0-9A-Z]{16}\b/u],
      ['privater Schlüssel', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u],
      ['Wrangler-Anmeldedatei', /^expiration_time\s*=\s*"20\d\d-/u],
    ];
    // Öffentliche Beispielzugangsdaten der AWS-Dokumentation (SigV4-Testvektor), keine echten Schlüssel.
    const allowed = /AKIAIOSFODNN7EXAMPLE|EXAMPLEKEY/u;
    const findings: string[] = [];
    for (const file of candidates) {
      if ((await stat(join(root, file))).size > 4 * 1024 * 1024) continue;
      const lines = (await readFile(join(root, file), 'utf8')).split('\n');
      for (const [label, pattern] of patterns) {
        if (lines.some((line) => pattern.test(line) && !allowed.test(line))) findings.push(`${file}: ${label}`);
      }
    }
    const tracked = git(['ls-files', '-z']);
    expect(tracked.filter((file) => /(^|\/)\.dev\.vars(\.|$)|(^|\/)\.wrangler\/config\/|(^|\/)\.env(\.[^.]+)?$/u.test(file) && !file.endsWith('.env.example'))).toEqual([]);
    expect(findings).toEqual([]);
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
