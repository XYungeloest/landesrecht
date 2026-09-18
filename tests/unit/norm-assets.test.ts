/**
 * Normative Abbildungen: `figure`-Block im Schema, Asset-Adressen und die Auslieferung über
 * `/assets/<land>/<sha256>.<endung>` (apps/web/src/lib/assets.ts) mit Fake-Bucket.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { getNormAssetUrl, parseNormAssetFileName } from '@landesrecht/legal-core/lib/routes.ts';
import { NORM_ASSET_PREFIXES, normAssetObjectKey } from '@landesrecht/runtime/assets.ts';

import { serveNormAsset, type AssetBucket } from '../../apps/web/src/lib/assets.ts';

const bytes = new TextEncoder().encode('GIF89a abbildung');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const asset = { sha256, mediaType: 'image/gif', byteLength: bytes.length, sourcePath: 'img/Karte.gif', width: 40, height: 30, description: 'Übersichtskarte' };

function fakeBucket(objects: Record<string, Uint8Array>): AssetBucket & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async get(key) {
      requested.push(key);
      const object = objects[key];
      return object ? { arrayBuffer: async () => object.slice().buffer } : null;
    },
  };
}

describe('Schema: figure-Block', () => {
  it('nimmt eine Abbildung mit Asset-Referenz an, ohne Text und ohne Kinder', () => {
    expect(parseBodyBlock({ type: 'figure', asset }, 'body[0]')).toEqual({ type: 'figure', asset });
    // Die Beschreibung ist optional.
    const { description: _description, ...bare } = asset;
    expect(parseBodyBlock({ type: 'figure', asset: bare }, 'body[0]').asset).toEqual(bare);
  });

  it('verlangt das Asset, verbietet Kinder und hält Assets von anderen Blocktypen fern', () => {
    expect(() => parseBodyBlock({ type: 'figure' }, 'body[0]')).toThrow(/asset.*erforderlich/u);
    expect(() => parseBodyBlock({ type: 'figure', asset, children: [] }, 'body[0]')).toThrow(/children/u);
    expect(() => parseBodyBlock({ type: 'paragraphText', text: 'x', asset }, 'body[0]')).toThrow(/nur an Blocktyp "figure"/u);
    // Die Bildbeschreibung ist kein Normtext.
    expect(() => parseBodyBlock({ type: 'figure', text: 'Übersichtskarte', asset }, 'body[0]')).toThrow(/asset\.description/u);
  });

  it('prüft SHA-256, Medienart und Größe des Assets', () => {
    expect(() => parseBodyBlock({ type: 'figure', asset: { ...asset, sha256: 'ABC' } }, 'b')).toThrow(/SHA-256/u);
    expect(() => parseBodyBlock({ type: 'figure', asset: { ...asset, mediaType: 'image/jpg' } }, 'b')).toThrow(/mediaType/u);
    expect(() => parseBodyBlock({ type: 'figure', asset: { ...asset, mediaType: 'image/svg+xml' } }, 'b')).toThrow(/mediaType/u);
    expect(() => parseBodyBlock({ type: 'figure', asset: { ...asset, byteLength: 0 } }, 'b')).toThrow(/byteLength/u);
    const { sourcePath: _sourcePath, ...withoutSource } = asset;
    expect(() => parseBodyBlock({ type: 'figure', asset: withoutSource }, 'b')).toThrow(/sourcePath/u);
  });
});

describe('Asset-Adressen', () => {
  it('bildet die Adresse aus Land, SHA-256 und der Endung der Medienart', () => {
    expect(getNormAssetUrl('baywue', asset as never)).toBe(`/assets/bayern-wuerttemberg/${sha256}.gif`);
    expect(getNormAssetUrl('baywue', { sha256, mediaType: 'image/jpeg' })).toBe(`/assets/bayern-wuerttemberg/${sha256}.jpg`);
    expect(parseNormAssetFileName(`${sha256}.png`)).toEqual({ sha256, mediaType: 'image/png', extension: 'png' });
  });

  it('lehnt alles ab, was kein SHA-256 mit erlaubter Endung ist', () => {
    for (const name of [`${sha256}.svg`, `${sha256}.GIF`, `${sha256}.jpeg`, `${sha256.toUpperCase()}.gif`, `${sha256.slice(1)}.gif`, `../${sha256}.gif`, `${sha256}.gif/x`, 'index.html']) {
      expect(parseNormAssetFileName(name)).toBeUndefined();
    }
  });

  it('kennt ein Asset-Präfix nur für BayWü; West und andere Länder haben keine Assets', () => {
    expect(normAssetObjectKey('baywue', sha256, 'gif')).toBe(`baywue/bayernrecht/2023-12-01/assets/${sha256}.gif`);
    expect(normAssetObjectKey('west', sha256, 'gif')).toBeUndefined();
    expect(normAssetObjectKey('baywue', 'x', 'gif')).toBeUndefined();
    expect(normAssetObjectKey('baywue', sha256, 'svg')).toBeUndefined();
    expect(Object.keys(NORM_ASSET_PREFIXES)).toEqual(['baywue']);
  });
});

describe('Auslieferung /assets/<land>/<datei>', () => {
  const key = `baywue/bayernrecht/2023-12-01/assets/${sha256}.gif`;

  it('liefert ein vorhandenes Asset mit Medienart, unveränderlichem Cache und nosniff', async () => {
    const response = await serveNormAsset({ jurisdiction: 'bayern-wuerttemberg', file: `${sha256}.gif` }, fakeBucket({ [key]: bytes }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/gif');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('etag')).toBe(`"${sha256}"`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('verweigert beschädigte Objekte: der Inhalt muss zum SHA-256 der Adresse passen', async () => {
    const response = await serveNormAsset({ jurisdiction: 'bayern-wuerttemberg', file: `${sha256}.gif` }, fakeBucket({ [key]: new TextEncoder().encode('anderes Bild') }));
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('liest nur Schlüssel unter dem Asset-Präfix des Landes und fragt sonst gar nicht erst', async () => {
    const bucket = fakeBucket({ [key]: bytes });
    for (const params of [
      { jurisdiction: 'west', file: `${sha256}.gif` },
      { jurisdiction: 'sachsen', file: `${sha256}.gif` },
      { jurisdiction: 'bayern-wuerttemberg', file: '..%2Fraw%2Fpaket.zip' },
      { jurisdiction: 'bayern-wuerttemberg', file: `${sha256}.zip` },
      { jurisdiction: 'bayern-wuerttemberg' },
      { jurisdiction: 'baywue', file: `${sha256}.gif` },
      {},
    ]) {
      expect((await serveNormAsset(params, bucket)).status).toBe(404);
    }
    expect(bucket.requested).toEqual([]);
  });

  it('antwortet 404 für fehlende Objekte und ohne Bucket-Bindung', async () => {
    const bucket = fakeBucket({});
    expect((await serveNormAsset({ jurisdiction: 'bayern-wuerttemberg', file: `${sha256}.gif` }, bucket)).status).toBe(404);
    expect(bucket.requested).toEqual([key]);
    expect((await serveNormAsset({ jurisdiction: 'bayern-wuerttemberg', file: `${sha256}.gif` }, undefined)).status).toBe(404);
  });
});
