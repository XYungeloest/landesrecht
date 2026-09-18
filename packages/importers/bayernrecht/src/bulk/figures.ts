/**
 * Abbildungs-Assets einer übernommenen Norm: Jeder `figure`-Block verweist über SHA-256 auf eine Bilddatei im
 * Exportpaket (Stammnorm oder zusammengeführte Anlage). Hier wird jede solche Datei als eigene Rohquelle mit
 * Rolle `figure` ins Manifest gebunden – mit Paketadresse, Paket-SHA-256 und Pfad im Paket. Das R2-Staging holt
 * die Bytes daraus (`r2/stage.ts`), der Objektschlüssel ist inhaltsadressiert (`assets/<sha256>.<endung>`).
 *
 * Eine Abbildung, deren Datei in keinem der Pakete mit genau diesem Pfad und SHA-256 liegt, ist ungebunden:
 * Die Norm wird dann nicht übernommen (Befund), denn eine Abbildung ohne belegte Quelle wird nicht ausgeliefert.
 */
import type { NormBodyAsset, NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import type { ManifestRawDocument } from '../common/manifest.ts';
import type { PackageAttachment } from '../parse/package.ts';

/** Ein Exportpaket, aus dem Abbildungen stammen können. */
export interface FigurePackage {
  url: string;
  sha256: string;
  retrievedAt: string;
  attachments: readonly PackageAttachment[];
}

function collectAssets(blocks: readonly NormBodyBlock[], into: NormBodyAsset[]): void {
  for (const block of blocks) {
    if (block.type === 'figure' && block.asset) into.push(block.asset);
    if (block.children) collectAssets(block.children, into);
  }
}

/** Alle Abbildungs-Assets einer Norm (alle Fassungen), je SHA-256 einmal, in Dokumentreihenfolge. */
export function recordFigureAssets(record: Pick<NormRecord, 'versions'>): NormBodyAsset[] {
  const all: NormBodyAsset[] = [];
  for (const version of record.versions) collectAssets(version.body, all);
  const seen = new Set<string>();
  return all.filter((asset) => (seen.has(asset.sha256) ? false : (seen.add(asset.sha256), true)));
}

export function figureRawDocuments(record: Pick<NormRecord, 'versions'>, packages: readonly FigurePackage[]): { raw: ManifestRawDocument[]; unbound: string[] } {
  const raw: ManifestRawDocument[] = [];
  const unbound: string[] = [];
  for (const asset of recordFigureAssets(record)) {
    const source = packages.find((candidate) => candidate.attachments.some((attachment) => attachment.sha256 === asset.sha256 && attachment.path === asset.sourcePath && attachment.byteLength === asset.byteLength));
    if (!source) {
      unbound.push(`${asset.sourcePath} (${asset.sha256.slice(0, 16)}…)`);
      continue;
    }
    raw.push({
      role: 'figure',
      url: source.url,
      finalUrl: source.url,
      sha256: asset.sha256,
      contentType: asset.mediaType,
      retrievedAt: source.retrievedAt,
      byteLength: asset.byteLength,
      packagePath: asset.sourcePath,
      packageSha256: source.sha256,
    });
  }
  return { raw, unbound };
}
