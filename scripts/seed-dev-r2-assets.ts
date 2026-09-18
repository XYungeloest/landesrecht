#!/usr/bin/env node
/**
 * Lokale Miniflare-R2 für `astro dev` mit den Abbildungs-Assets füllen (optional).
 *
 * Die Worker-Route `/assets/<land>/<sha256>.<ext>` liest aus dem Binding `LANDESRECHT_QUELLEN`; im Dev-Server
 * zeigt es auf eine lokale, zunächst leere R2 unter apps/web/.wrangler/state. Dieses Skript legt die bereits
 * gestagten, inhaltsadressierten Assets (`.cache/bayernrecht-r2-staging/<präfix>assets/`) dort ab – nur lokal, nie
 * remote (kein Transport, keine Zugangsdaten). Jede Datei wird vorher gegen den SHA-256 ihres Namens geprüft.
 *
 *   node scripts/seed-dev-r2-assets.ts
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getPlatformProxy } from 'wrangler';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { R2_SOURCES_BINDING } from '@landesrecht/runtime/bindings.ts';
import { NORM_ASSET_PREFIXES } from '@landesrecht/runtime/assets.ts';

const root = resolveRepositoryRoot();
const stagingDir = join(root, '.cache', 'bayernrecht-r2-staging');
/** Nur die hier genutzte Methode des R2-Bindings (die Worker-Typen stehen Node-Skripten nicht zur Verfügung). */
interface LocalBucket {
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
}

const proxy = await getPlatformProxy<Record<string, LocalBucket>>({
  configPath: join(root, 'apps', 'web', 'wrangler.jsonc'),
  persist: { path: join(root, 'apps', 'web', '.wrangler', 'state', 'v3') },
});
try {
  const bucket = proxy.env[R2_SOURCES_BINDING];
  if (!bucket) throw new Error(`Binding ${R2_SOURCES_BINDING} fehlt in apps/web/wrangler.jsonc`);
  for (const [jurisdiction, prefix] of Object.entries(NORM_ASSET_PREFIXES)) {
    const directory = join(stagingDir, prefix!);
    const files = (await readdir(directory).catch(() => [] as string[])).filter((name) => /^[0-9a-f]{64}\.(?:gif|jpg|png)$/u.test(name));
    let written = 0;
    for (const name of files) {
      const bytes = await readFile(join(directory, name));
      if (createHash('sha256').update(bytes).digest('hex') !== name.slice(0, 64)) throw new Error(`${name}: Inhalt passt nicht zum SHA-256 des Namens`);
      const contentType = name.endsWith('.gif') ? 'image/gif' : name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      await bucket.put(`${prefix}${name}`, bytes, { httpMetadata: { contentType } });
      written += 1;
    }
    console.log(`${jurisdiction}: ${written} Assets → lokale Miniflare-R2 (${prefix})`);
  }
} finally {
  await proxy.dispose();
}
