/**
 * OstRecht-Schema-Fixture (tests/fixtures/ostrecht/ostrecht-recht.sql, Auszug aus einem OstRecht-Seed) als In-Memory-D1
 * hinter der Read-only-Hülle – so, wie der Worker die OstRecht-D1 `ostrecht-recht` sieht.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { createOstRechtD1Store, type OstRechtStoreOptions } from '@landesrecht/runtime/ostrecht-d1-store.ts';
import { createReadOnlyD1, type ReadOnlyD1Database } from '@landesrecht/runtime/read-only-d1.ts';
import { openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';

export const OSTRECHT_FIXTURE_PATH = join(resolveRepositoryRoot(), 'tests', 'fixtures', 'ostrecht', 'ostrecht-recht.sql');

export interface OstRechtFixture {
  /** Native Datenbank (nur für Tests, die den Zustand verändern, etwa `sync_state`). */
  native: SqliteD1Database;
  db: ReadOnlyD1Database;
  store: NormStore;
}

export async function openOstRechtFixture(options: OstRechtStoreOptions = { contract: { recheckAfterMs: 0 } }): Promise<OstRechtFixture> {
  const native = await openSqliteD1(':memory:');
  native.native.exec(readFileSync(OSTRECHT_FIXTURE_PATH, 'utf8'));
  const db = createReadOnlyD1(native);
  return { native, db, store: createOstRechtD1Store(db, options) };
}
