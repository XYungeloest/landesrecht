import { readFile, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { createWranglerR2Transport, R2TransportError } from '../../packages/importers/recht-nrw/src/common/r2-transport.ts';

/** Nachbildung von `wrangler r2 object put/get --remote`: Objekte im Speicher, Fehlerausgaben wie Wrangler 4. */
function fakeWrangler(options: { failPut?: boolean; unauthorizedOnce?: boolean } = {}) {
  const objects = new Map<string, Uint8Array>();
  const calls: string[][] = [];
  let unauthorizedPending = options.unauthorizedOnce ?? false;
  const exec = async (file: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
    calls.push([file, ...args]);
    if (unauthorizedPending) {
      // Wrangler während der OAuth-Token-Erneuerung: einmalig 401, danach normal.
      unauthorizedPending = false;
      throw Object.assign(new Error('Command failed'), { stderr: '✘ [ERROR] Failed to fetch /accounts/x/r2/buckets/landesrecht-quellen/objects/k - 401: Unauthorized;\n{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}' });
    }
    const objectIndex = args.indexOf('object');
    const verb = args[objectIndex + 1];
    const target = args[objectIndex + 2]!;
    const key = target.replace(/^landesrecht-quellen\//u, '');
    const fileIndex = args.indexOf('--file');
    const path = args[fileIndex + 1]!;
    if (verb === 'get') {
      const bytes = objects.get(key);
      if (!bytes) {
        const error = new Error(`Command failed: npx wrangler r2 object get ${target} --file ${path} --remote\n✘ [ERROR] The specified key does not exist.\n`) as Error & { stderr: string };
        error.stderr = '✘ [ERROR] The specified key does not exist.\n';
        throw error;
      }
      await writeFile(path, bytes);
      return { stdout: '', stderr: '' };
    }
    if (verb === 'put') {
      if (options.failPut) throw Object.assign(new Error('Command failed: put'), { stderr: '✘ [ERROR] Authentication error [code: 10000]' });
      objects.set(key, new Uint8Array(await readFile(path)));
      return { stdout: '', stderr: '' };
    }
    throw new Error(`unerwartet: ${args.join(' ')}`);
  };
  return { objects, calls, exec };
}

describe('Wrangler-R2-Transport (OAuth-Anmeldung, ohne S3-Schlüssel)', () => {
  it('meldet fehlende Objekte als „nicht vorhanden“ statt als Fehler und liest Hochgeladenes zurück', async () => {
    const wrangler = fakeWrangler();
    const transport = createWranglerR2Transport({ bucket: 'landesrecht-quellen', cwd: 'apps/web', exec: wrangler.exec });
    expect(await transport.head('west/recht-nrw/2023-12-01/term-1/abc-version-page.html')).toBeNull();
    expect(await transport.get('west/recht-nrw/2023-12-01/term-1/abc-version-page.html')).toBeNull();
    const bytes = new TextEncoder().encode('<html>Fassung</html>');
    await transport.put('west/recht-nrw/2023-12-01/term-1/abc-version-page.html', bytes, { contentType: 'text/html', metadata: { sha256: 'x' } });
    expect(await transport.get('west/recht-nrw/2023-12-01/term-1/abc-version-page.html')).toEqual(bytes);
    expect((await transport.head('west/recht-nrw/2023-12-01/term-1/abc-version-page.html'))?.size).toBe(bytes.byteLength);
    // Nur put/get --remote über die Wrangler-Anmeldung (lokales Wrangler oder npx); keine Schlüssel, kein Bucket-Listing.
    expect(wrangler.calls.every((call) => (call[0] === 'npx' ? call[1] === 'wrangler' : call[0]!.endsWith('/wrangler')) && call.includes('r2') && call.at(-1) === '--remote')).toBe(true);
    expect(wrangler.calls.map((call) => call[call.indexOf('object') + 1])).toEqual(['get', 'get', 'put', 'get', 'get']);
  });

  it('wiederholt einen vorübergehenden 401 während der Token-Erneuerung statt den Lauf abzubrechen', async () => {
    const wrangler = fakeWrangler({ unauthorizedOnce: true });
    const transport = createWranglerR2Transport({ bucket: 'landesrecht-quellen', exec: wrangler.exec });
    const bytes = new Uint8Array([1, 2, 3]);
    await transport.put('k', bytes, { contentType: 'application/octet-stream', metadata: {} });
    expect(wrangler.calls.filter((call) => call[call.indexOf('object') + 1] === 'put')).toHaveLength(2);
    expect(await transport.get('k')).toEqual(bytes);
  }, 15_000);

  it('reicht andere Wrangler-Fehler als Transportfehler weiter', async () => {
    const wrangler = fakeWrangler({ failPut: true });
    const transport = createWranglerR2Transport({ bucket: 'landesrecht-quellen', exec: wrangler.exec });
    await expect(transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} })).rejects.toBeInstanceOf(R2TransportError);
  });
});
