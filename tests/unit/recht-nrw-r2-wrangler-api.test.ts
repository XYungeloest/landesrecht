import { describe, expect, it } from 'vitest';

import { createWranglerApiR2Transport, parseWranglerOAuthConfig, R2TransportError, wranglerConfigCandidates } from '../../packages/importers/recht-nrw/src/common/r2-transport.ts';

/** Nachbildung der Cloudflare-R2-Objekt-API (api.cloudflare.com): Objekte im Speicher, Bearer-Prüfung, 429/401-Szenarien. */
function fakeApi(options: { validTokens: string[]; rateLimitOnce?: boolean } = { validTokens: ['tok-1'] }) {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const requests: Array<{ method: string; path: string; token: string }> = [];
  let rateLimitPending = options.rateLimitOnce ?? false;
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = init?.headers as Record<string, string>;
    const token = (headers.authorization ?? '').replace(/^Bearer /u, '');
    requests.push({ method: init?.method ?? 'GET', path: url.pathname, token });
    if (!options.validTokens.includes(token)) return new Response('{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}', { status: 401 });
    if (url.pathname === '/client/v4/accounts') return new Response(JSON.stringify({ result: [{ id: 'acc-1', name: 'Konto' }] }), { status: 200 });
    if (rateLimitPending) {
      rateLimitPending = false;
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
    }
    const match = /^\/client\/v4\/accounts\/acc-1\/r2\/buckets\/landesrecht-quellen\/objects\/(.+)$/u.exec(url.pathname);
    if (!match) return new Response('not found', { status: 404 });
    const key = decodeURIComponent(match[1]!);
    if (init?.method === 'PUT') {
      objects.set(key, { bytes: new Uint8Array(init.body as Buffer), contentType: headers['content-type'] ?? '' });
      return new Response('{"success":true}', { status: 200 });
    }
    const stored = objects.get(key);
    if (!stored) return new Response('{"success":false,"errors":[{"code":10007,"message":"The specified key does not exist."}]}', { status: 404 });
    return new Response(Buffer.from(stored.bytes), { status: 200, headers: { 'content-type': stored.contentType } });
  }) as typeof fetch;
  return { objects, requests, fetchImplementation };
}

describe('Wrangler-API-R2-Transport (bestehende OAuth-Anmeldung ohne Prozessstart)', () => {
  it('liest Token und Ablauf aus Wranglers Anmeldedatei, ohne andere Werte zu übernehmen', () => {
    const parsed = parseWranglerOAuthConfig('oauth_token = "tok-1"\nexpiration_time = "2030-01-01T00:00:00.000Z"\nrefresh_token = "geheim"\nscopes = [ "account:read" ]\n');
    expect(parsed).toEqual({ oauthToken: 'tok-1', expirationTime: '2030-01-01T00:00:00.000Z' });
    expect(wranglerConfigCandidates({ HOME: '/home/u' }, 'darwin')[0]).toBe('/home/u/Library/Preferences/.wrangler/config/default.toml');
    expect(wranglerConfigCandidates({ HOME: '/home/u', XDG_CONFIG_HOME: '/xdg' }, 'linux')[0]).toBe('/xdg/.wrangler/config/default.toml');
  });

  it('fehlende Objekte → null; Upload und Rücklesung über die Objekt-API; Konto aus der Anmeldung', async () => {
    const api = fakeApi();
    const transport = createWranglerApiR2Transport({ bucket: 'landesrecht-quellen', fetchImplementation: api.fetchImplementation, readToken: async () => ({ oauthToken: 'tok-1', expirationTime: '2030-01-01T00:00:00.000Z' }), refreshToken: async () => undefined });
    const key = 'west/recht-nrw/2023-12-01/term-1/abc-version-page.html';
    expect(await transport.head(key)).toBeNull();
    const bytes = new TextEncoder().encode('<html>Fassung</html>');
    await transport.put(key, bytes, { contentType: 'text/html', metadata: {} });
    expect(await transport.get(key)).toEqual(bytes);
    expect((await transport.head(key))?.size).toBe(bytes.byteLength);
    expect(api.objects.get(key)?.contentType).toBe('text/html');
    expect(api.requests.map((request) => request.method)).toEqual(['GET', 'GET', 'PUT', 'GET', 'GET']);
    expect(api.requests.every((request) => request.token === 'tok-1')).toBe(true);
  });

  it('erneuert das Token bei 401 einmalig über Wrangler und wiederholt 429 mit Abstand', async () => {
    const api = fakeApi({ validTokens: ['tok-2'], rateLimitOnce: true });
    let current = { oauthToken: 'tok-1', expirationTime: '2030-01-01T00:00:00.000Z' };
    let refreshes = 0;
    const transport = createWranglerApiR2Transport({ bucket: 'landesrecht-quellen', accountId: 'acc-1', fetchImplementation: api.fetchImplementation, readToken: async () => current, refreshToken: async () => { refreshes += 1; current = { oauthToken: 'tok-2', expirationTime: '2030-01-01T00:00:00.000Z' }; } });
    await transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} });
    expect(refreshes).toBe(1);
    expect(api.requests.map((request) => `${request.method}:${request.token}`)).toEqual(['PUT:tok-1', 'PUT:tok-2', 'PUT:tok-2']);
    expect(await transport.get('k')).toEqual(new Uint8Array([1]));
  }, 20_000);

  it('bricht ohne gültige Anmeldung mit Transportfehler ab', async () => {
    const api = fakeApi();
    const transport = createWranglerApiR2Transport({ bucket: 'landesrecht-quellen', accountId: 'acc-1', fetchImplementation: api.fetchImplementation, readToken: async () => ({}), refreshToken: async () => undefined });
    await expect(transport.get('k')).rejects.toBeInstanceOf(R2TransportError);
  });
});
