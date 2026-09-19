/**
 * Konsistenzprüfung des juris-SH-Zustands (Befehl `audit`): Enumeration, Quelleninventar, Probe, Manifest,
 * Review-Queue und Bestand passen zueinander. Liest nur; Cachebelege werden nachgerechnet, nicht geglaubt.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cacheKey, sha256Hex } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { CACHE_DIR } from '../common/constants.ts';
import { openReviewItems } from '../common/review.ts';
import { checkEnumeration, ENUMERABLE_AREAS } from '../enumerate/enumeration.ts';
import { CONTENT_DIR, type AdapterSnapshot } from './status.ts';

export interface AuditCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface AuditResult {
  ok: boolean;
  checks: AuditCheck[];
  review: { total: number; open: number; byCategory: Array<[string, number]> };
  manifestEntries: number;
}

async function cachedSha(cacheDir: string, url: string): Promise<string | undefined> {
  try {
    return sha256Hex(new Uint8Array(await readFile(join(cacheDir, `${cacheKey(url)}.bin`))));
  } catch {
    return undefined;
  }
}

export async function runAudit(root: string, snapshot: AdapterSnapshot, cacheDir = join(root, CACHE_DIR)): Promise<AuditResult> {
  const checks: AuditCheck[] = [];

  for (const area of ENUMERABLE_AREAS) {
    const file = snapshot.enumeration[area];
    const problems = file ? checkEnumeration(file) : ['fehlt'];
    checks.push({ id: `enumeration-${area}`, ok: problems.length === 0, detail: problems.length === 0 ? `${file!.items.length} Einträge, Fingerabdruck ${file!.fingerprint.slice(0, 12)}…` : problems.join('; ') });
  }

  if (snapshot.inventory) {
    const mismatched = ENUMERABLE_AREAS.filter((area) => snapshot.enumeration[area] && snapshot.inventory!.areas[area]?.fingerprint !== snapshot.enumeration[area]!.fingerprint);
    checks.push({ id: 'quelleninventar', ok: mismatched.length === 0, detail: mismatched.length === 0 ? 'Fingerabdrücke von Inventar und Enumeration stimmen überein' : `Inventar veraltet für ${mismatched.join(', ')} (enumerate --write erneut ausführen)` });
    const sitemapProblems: string[] = [];
    for (const source of [snapshot.inventory.sitemap.index, ...snapshot.inventory.sitemap.sitemaps]) {
      const sha = await cachedSha(cacheDir, source.url);
      if (sha === undefined) sitemapProblems.push(`${source.url} nicht im Cache`);
      else if (sha !== source.sha256) sitemapProblems.push(`${source.url}: Cache ${sha.slice(0, 12)}… ≠ Beleg ${source.sha256.slice(0, 12)}… (neuerer Abruf – Enumeration mit --write aktualisieren)`);
    }
    checks.push({ id: 'sitemap-belege', ok: sitemapProblems.length === 0, detail: sitemapProblems.length === 0 ? 'SHA-256 der Sitemap-Belege im Cache nachgerechnet' : sitemapProblems.join('; ') });
  } else {
    checks.push({ id: 'quelleninventar', ok: false, detail: 'source-inventory.json fehlt' });
  }

  if (snapshot.addressability) {
    const problems: string[] = [];
    for (const probe of snapshot.addressability.probes) {
      if (!probe.sha256) continue;
      const sha = await cachedSha(cacheDir, probe.url);
      if (sha !== undefined && sha !== probe.sha256) problems.push(`${probe.url}: Cache weicht vom Beleg ab`);
    }
    checks.push({ id: 'probe-belege', ok: problems.length === 0, detail: problems.length === 0 ? `${snapshot.addressability.probes.length} Probebelege konsistent` : problems.join('; ') });
  } else {
    checks.push({ id: 'probe-belege', ok: false, detail: 'content-addressability.json fehlt' });
  }

  const importedEntries = snapshot.manifest.entries.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings');
  const importedSlugs = new Set(importedEntries.map((entry) => entry.targetSlug));
  const contentSlugs = new Set(snapshot.contentSlugs);
  const orphan = [...contentSlugs].filter((slug) => !importedSlugs.has(slug));
  const missing = [...importedSlugs].filter((slug) => !contentSlugs.has(slug));
  const expectedFiles = importedEntries.length * 3;
  checks.push({
    id: 'bestand',
    ok: orphan.length === 0 && missing.length === 0 && snapshot.contentFiles === expectedFiles,
    detail: `${importedEntries.length} übernommene Manifesteinträge, ${contentSlugs.size} Normverzeichnisse, ${snapshot.contentFiles} Dateien unter ${CONTENT_DIR} (erwartet ${expectedFiles})${orphan.length ? `; ohne Manifest: ${orphan.slice(0, 5).join(', ')}` : ''}${missing.length ? `; ohne Verzeichnis: ${missing.slice(0, 5).join(', ')}` : ''}`,
  });

  // Rohquellen der übernommenen Normen: SHA-256 im Cache nachrechnen (Gesamtausgabe bzw. Einzelfassungen).
  {
    let verified = 0;
    const problems: string[] = [];
    for (const entry of importedEntries) {
      for (const raw of entry.rawDocuments) {
        const sha = await cachedSha(cacheDir, raw.url);
        if (sha === undefined) problems.push(`${entry.sourceIdentity}: ${raw.url.slice(0, 80)} nicht im Cache`);
        else if (sha !== raw.sha256) problems.push(`${entry.sourceIdentity}: Cache weicht vom Manifest ab`);
        else verified += 1;
      }
    }
    checks.push({ id: 'rohquellen', ok: problems.length === 0, detail: problems.length === 0 ? `${verified} Rohquellen (PDF) übernommener Normen im Cache nachgerechnet` : `${problems.length} Abweichungen: ${problems.slice(0, 5).join('; ')}` });
  }

  const categories = new Map<string, number>();
  for (const item of snapshot.review.items) categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  return {
    ok: checks.every((check) => check.ok),
    checks,
    review: { total: snapshot.review.items.length, open: openReviewItems(snapshot.review).length, byCategory: [...categories].sort((left, right) => left[0].localeCompare(right[0])) },
    manifestEntries: snapshot.manifest.entries.length,
  };
}
