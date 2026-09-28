/**
 * Bundesportal-Discovery: Liegt das Schema lokal vor (imports/bund/schema.sql, gitignoriert), muss jede Tabelle in
 * docs/BUNDESRECHT_COMPATIBILITY.md eingeordnet sein. Keine Anbindung, nur Dokumentationsvertrag.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

const root = resolveRepositoryRoot();
const schemaPath = join(root, 'imports', 'bund', 'schema.sql');
const doc = readFileSync(join(root, 'docs', 'BUNDESRECHT_COMPATIBILITY.md'), 'utf8');

describe('Bundesrecht-Kompatibilität', () => {
  it('ordnet jede Tabelle des Bundesschemas ein (nur wenn das Schema lokal vorliegt)', () => {
    if (!existsSync(schemaPath)) return;
    const tables = [...readFileSync(schemaPath, 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/gu)].map((match) => match[1]!);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(doc, table).toContain(`\`${table}\``);
  });

  it('empfiehlt keine Kopie und keine produktive Bindung', () => {
    expect(doc).toContain('Noch keine Anbindung, kein Import, keine Runtime-Bindung');
    expect(doc).toMatch(/\*\*Empfehlung: A\*\*/u);
  });
});
