/**
 * Quellen ohne Stammnorm-Kennung: Statt eines stillen Abbruchs entsteht ein expliziter Datensatz mit URL, Titel,
 * Fehlergrund, Abrufstatus und Hashes – ohne eine Kennung zu erfinden.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FetchedDocument } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { recordUnresolvedSource, UNRESOLVED_SOURCE_SCHEMA, unresolvedSourcePath } from '@landesrecht/importer-recht-nrw/common/unresolved.ts';

const URL_A = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/01102025-einkommenserlass-wohnen-nordrhein-westfalen-eewo-nrw';
const URL_B = 'https://recht.nrw.de/lrgv/gesetz/01012027-zustaendigkeitsverordnung-vergabekammer';

function document(url: string, text: string): FetchedDocument {
  const bytes = new TextEncoder().encode(text);
  return { url, finalUrl: url, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: '2026-09-16T10:00:00.000Z', sha256: 'a'.repeat(64), bytes, fromCache: false };
}

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'landesrecht-unresolved-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('Quellen ohne Stammnorm-Kennung', () => {
  it('bildet den Pfad deterministisch aus Bereich und Adresse', () => {
    expect(unresolvedSourcePath('lrmb', URL_A)).toMatch(/^data\/audits\/recht-nrw\/lrmb\/unresolved\/[0-9a-f]{16}\.json$/u);
    expect(unresolvedSourcePath('lrmb', URL_A)).toBe(unresolvedSourcePath('lrmb', URL_A));
    expect(unresolvedSourcePath('lrmb', URL_A)).not.toBe(unresolvedSourcePath('lrmb', URL_B));
    expect(unresolvedSourcePath('lrgv', URL_A)).not.toBe(unresolvedSourcePath('lrmb', URL_A));
  });

  it('schreibt im Schreiblauf den vollständigen Datensatz und im Dry-run nichts', async () => {
    const findings = [
      { severity: 'info', code: 'note', message: 'nur Hinweis' },
      { severity: 'error', code: 'missing-stem-id', message: 'Keine Stammnorm-Kennung (Taxonomie-Term)' },
    ];
    const documents = [{ role: 'version-page', document: document(URL_A, '<html>Seite</html>') }];
    const dry = await recordUnresolvedSource({ root, write: false, area: 'lrmb', url: URL_A, title: 'Einkommenserlass Wohnen', importStatus: 'failed', findings, documents, now: '2026-09-16T10:00:00.000Z' });
    expect(dry).toEqual({ path: unresolvedSourcePath('lrmb', URL_A), written: false });
    await expect(stat(join(root, dry.path))).rejects.toThrow();

    const written = await recordUnresolvedSource({ root, write: true, area: 'lrmb', url: URL_A, title: 'Einkommenserlass Wohnen', importStatus: 'failed', findings, documents, runId: 'lauf-1', now: '2026-09-16T10:00:00.000Z' });
    expect(written.written).toBe(true);
    const record = JSON.parse(await readFile(join(root, written.path), 'utf8')) as Record<string, unknown>;
    expect(record).toMatchObject({
      schemaVersion: UNRESOLVED_SOURCE_SCHEMA,
      sourceArea: 'lrmb',
      url: URL_A,
      title: 'Einkommenserlass Wohnen',
      importStatus: 'failed',
      reason: [{ severity: 'error', code: 'missing-stem-id', message: 'Keine Stammnorm-Kennung (Taxonomie-Term)' }],
      documents: [{ role: 'version-page', url: URL_A, httpStatus: 200, sha256: 'a'.repeat(64), byteLength: 18 }],
      runId: 'lauf-1',
    });
  });
});
