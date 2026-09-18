/**
 * Auslieferung der Abbildungs-Assets (`figure`-Blöcke). Reine Funktion, damit Route und Tests dieselbe Prüfung
 * verwenden: gültige Adresse, Schlüssel nur unter dem Asset-Präfix des Landes, Inhalt mit dem SHA-256 der Adresse.
 */
import { getJurisdictionByPathSegment } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { parseNormAssetFileName } from '@landesrecht/legal-core/lib/routes.ts';
import { normAssetObjectKey } from '@landesrecht/runtime/assets.ts';

export interface AssetBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function serveNormAsset(params: { jurisdiction?: string; file?: string }, bucket: AssetBucket | undefined): Promise<Response> {
  const jurisdiction = params.jurisdiction ? getJurisdictionByPathSegment(params.jurisdiction) : undefined;
  const file = params.file ? parseNormAssetFileName(params.file) : undefined;
  if (!jurisdiction || !file) return text(404, 'Nicht gefunden');
  const key = normAssetObjectKey(jurisdiction.id, file.sha256, file.extension);
  if (!key || !bucket) return text(404, 'Nicht gefunden');
  const object = await bucket.get(key);
  if (!object) return text(404, 'Nicht gefunden');
  const bytes = await object.arrayBuffer();
  if ((await sha256Hex(bytes)) !== file.sha256) return text(502, 'Asset beschädigt');
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': file.mediaType,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${file.sha256}"`,
      'x-content-type-options': 'nosniff',
    },
  });
}
