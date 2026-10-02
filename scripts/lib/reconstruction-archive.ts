/** Audit-only fetcher: pinned manifest evidence, never the portal or a transient HTTP cache. */
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { sha256Hex, type RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

export function createReconstructionArchiveFetcher(root: string, manifest: ManifestEntry): RechtNrwFetcher {
  const stats = { networkRequests: 0, cacheHits: 0 };
  return {
    stats,
    async fetch(url, request) {
      const raw = manifest.rawDocuments.find((entry) => entry.url === url || entry.finalUrl === url);
      const fail = (reason: string): never => {
        throw new Error(`Archiv-Evidenz ${manifest.sourceIdentity}: ${reason}; URL ${url}; Pfad ${raw?.localSource ?? 'nicht hinterlegt'}; SHA-256 ${raw?.sha256 ?? 'nicht hinterlegt'}. Ohne diese Evidenz ist das eingefrorene Rezept nicht vollständig auditierbar.`);
      };
      if (request?.body !== undefined || (request?.method && request.method !== 'GET')) fail('Nur archivierte GET-Dokumente zulässig');
      if (!raw?.localSource) return fail('Keine lokale Archivdatei im Manifest');
      const path = resolve(root, raw.localSource);
      const rel = relative(resolve(root), path);
      if (rel.startsWith('..') || isAbsolute(rel)) return fail('Archivpfad außerhalb des Repository');
      const bytes = await readFile(path).catch(() => fail('Archivdatei fehlt oder ist nicht lesbar'));
      if (sha256Hex(bytes) !== raw.sha256 || bytes.length !== raw.byteLength) return fail('Hash oder Bytezahl weicht vom Manifest ab');
      stats.cacheHits++;
      return { url, finalUrl: raw.finalUrl, status: 200, contentType: raw.contentType, retrievedAt: raw.retrievedAt, sha256: raw.sha256, bytes, fromCache: true };
    },
  };
}
