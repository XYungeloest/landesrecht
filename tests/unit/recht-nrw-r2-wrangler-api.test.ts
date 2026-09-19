/**
 * Transport `wrangler-api` (optional, lokal): Anmeldedatei fail-closed lesen, Token nie ausgeben, Rotation,
 * Ablauf, Abmeldung, mehrere Konten, CI ohne Anmeldedatei, 401/429/5xx-Verhalten – alles mit Fake-Fetch und
 * Fake-Dateien; keine echten Tokens (die Werte unten sind erfundene Platzhalter mit Token-Form).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createWranglerApiR2Transport, parseWranglerAuthConfig, parseWranglerOAuthConfig, R2TransportError, readWranglerAuthFile, redactSecrets, WranglerAuthError, wranglerConfigCandidates, type WranglerAuthConfig } from '../../packages/importers/recht-nrw/src/common/r2-transport.ts';

const TOKEN_A = 'fakeTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'fakeTokenBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const noSleep = async (): Promise<void> => undefined;

/** Nachbildung der Cloudflare-R2-Objekt-API: Objekte im Speicher, Bearer-Prüfung, Konten, 429/5xx-Szenarien. */
function fakeApi(options: { validTokens?: string[]; accounts?: Array<{ id: string; name: string }>; rateLimitOnce?: boolean; serverErrors?: number; accountId?: string } = {}) {
  const validTokens = options.validTokens ?? [TOKEN_A];
  const accountId = options.accountId ?? 'acc-1';
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const requests: Array<{ method: string; path: string; token: string }> = [];
  let rateLimitPending = options.rateLimitOnce ?? false;
  let serverErrors = options.serverErrors ?? 0;
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = init?.headers as Record<string, string>;
    const token = (headers.authorization ?? '').replace(/^Bearer /u, '');
    requests.push({ method: init?.method ?? 'GET', path: url.pathname, token });
    if (!validTokens.includes(token)) return new Response('{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}', { status: 401 });
    if (url.pathname === '/client/v4/accounts') return new Response(JSON.stringify({ result: options.accounts ?? [{ id: accountId, name: 'Konto' }] }), { status: 200 });
    if (serverErrors > 0) {
      serverErrors -= 1;
      return new Response('upstream', { status: 502 });
    }
    if (rateLimitPending) {
      rateLimitPending = false;
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } });
    }
    const listing = new RegExp(`^/client/v4/accounts/${accountId}/r2/buckets/landesrecht-quellen/objects$`, 'u').exec(url.pathname);
    if (listing) {
      const prefix = url.searchParams.get('prefix') ?? '';
      const all = [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.bytes.byteLength, etag: '"0123456789abcdef0123456789abcdef"' }));
      const cursor = url.searchParams.get('cursor');
      const page = cursor ? all.slice(1) : all.slice(0, 1);
      return new Response(JSON.stringify({ result: page, result_info: cursor || all.length <= 1 ? { is_truncated: false } : { is_truncated: true, cursor: 'next' } }), { status: 200 });
    }
    const match = new RegExp(`^/client/v4/accounts/${accountId}/r2/buckets/landesrecht-quellen/objects/(.+)$`, 'u').exec(url.pathname);
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

function transportWith(api: ReturnType<typeof fakeApi>, extra: { readToken?: () => Promise<WranglerAuthConfig>; refreshToken?: () => Promise<void>; env?: Record<string, string | undefined>; accountId?: string; debug?: string[]; now?: () => number }) {
  return createWranglerApiR2Transport({
    bucket: 'landesrecht-quellen',
    fetchImplementation: api.fetchImplementation,
    env: extra.env ?? {},
    ...(extra.accountId ? { accountId: extra.accountId } : {}),
    readToken: extra.readToken ?? (async () => ({ oauthToken: TOKEN_A, expirationTime: FUTURE })),
    refreshToken: extra.refreshToken ?? (async () => undefined),
    ...(extra.now ? { now: extra.now } : {}),
    retry: { sleep: noSleep },
    ...(extra.debug ? { debugLog: (line: string) => extra.debug!.push(line) } : {}),
  });
}

const failure = (promise: Promise<unknown>): Promise<Error> => promise.then(() => { throw new Error('unerwartet erfolgreich'); }, (error: Error) => error);

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('Wrangler-Anmeldedatei (fail-closed, nur im Speicher)', () => {
  it('liest oauth_token, expiration_time und api_token, ignoriert alle anderen Felder', () => {
    const parsed = parseWranglerAuthConfig(`oauth_token = "${TOKEN_A}"\nexpiration_time = "${FUTURE}"\nrefresh_token = "${TOKEN_B}"\nscopes = [ "account:read", "workers:write" ]\n`);
    expect(parsed).toEqual({ oauthToken: TOKEN_A, expirationTime: FUTURE });
    expect(parseWranglerOAuthConfig).toBe(parseWranglerAuthConfig);
    expect(parseWranglerAuthConfig(`api_token = "${TOKEN_B}"\n`)).toEqual({ apiToken: TOKEN_B });
    expect(parseWranglerAuthConfig('')).toEqual({});
    expect(parseWranglerAuthConfig('# nur Kommentar\nscopes = [\n  "account:read",\n]\n')).toEqual({});
  });

  it('lehnt unerwartete Formen der Tokenfelder ab statt zu raten', () => {
    expect(() => parseWranglerAuthConfig('oauth_token = kurz\n')).toThrow(/kein einfacher String/u);
    expect(() => parseWranglerAuthConfig('oauth_token = "mit leerzeichen und quotes"\n')).toThrow(/keine Token-Form/u);
    expect(() => parseWranglerAuthConfig("oauth_token = 'einfach'\n")).toThrow(/kein einfacher String/u);
    expect(() => parseWranglerAuthConfig('expiration_time = 2030\n')).toThrow(/kein einfacher String/u);
    // Tabellen gehören nicht zum Format: Felder darunter zählen nicht als Anmeldung.
    expect(parseWranglerAuthConfig(`[irgendwas]\noauth_token = "${TOKEN_A}"\n`)).toEqual({});
  });

  it('leitet die Pfade aus der Umgebung ab (XDG, Systemordner, ~/.wrangler) – nichts benutzerspezifisch fest', () => {
    expect(wranglerConfigCandidates({ HOME: '/home/u' }, 'darwin')).toEqual(['/home/u/Library/Preferences/.wrangler/config/default.toml', '/home/u/.wrangler/config/default.toml']);
    expect(wranglerConfigCandidates({ HOME: '/home/u' }, 'linux')).toEqual(['/home/u/.config/.wrangler/config/default.toml', '/home/u/.wrangler/config/default.toml']);
    expect(wranglerConfigCandidates({ HOME: '/home/u', XDG_CONFIG_HOME: '/xdg' }, 'darwin')[0]).toBe('/xdg/.wrangler/config/default.toml');
    expect(wranglerConfigCandidates({ HOME: 'C:\\Users\\u', APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, 'win32')[0]).toContain('AppData');
  });

  it('meldet fehlende, leere und unlesbare Dateien klar (CI, wrangler logout) – ohne Werte', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wrangler-auth-'));
    dirs.push(dir);
    const missing = await failure(readWranglerAuthFile([join(dir, 'fehlt.toml')]));
    expect(missing).toBeInstanceOf(WranglerAuthError);
    expect((missing as WranglerAuthError).reason).toBe('not-found');
    expect(missing.message).toMatch(/npx wrangler login/u);
    expect(missing.message).toMatch(/CLOUDFLARE_API_TOKEN/u);
    const empty = join(dir, 'leer.toml');
    await writeFile(empty, '\n');
    expect(((await failure(readWranglerAuthFile([empty]))) as WranglerAuthError).reason).toBe('missing-token');
    const broken = join(dir, 'kaputt.toml');
    await writeFile(broken, 'oauth_token = 123\n');
    const format = await failure(readWranglerAuthFile([broken]));
    expect((format as WranglerAuthError).reason).toBe('format');
    expect(format.message).toMatch(/--r2-transport wrangler/u);
    const valid = join(dir, 'ok.toml');
    await writeFile(valid, `oauth_token = "${TOKEN_A}"\nexpiration_time = "${FUTURE}"\nrefresh_token = "${TOKEN_B}"\n`);
    expect(await readWranglerAuthFile([join(dir, 'fehlt.toml'), valid])).toEqual({ oauthToken: TOKEN_A, expirationTime: FUTURE });
  });

  it('entfernt Token-Formen aus Meldungen (zweite Schranke)', () => {
    expect(redactSecrets(`Fehler bei Bearer ${TOKEN_A} und oauth_token = "${TOKEN_B}"`)).toBe('Fehler bei Bearer [entfernt] und oauth_token=[entfernt]');
    expect(redactSecrets('AWS4-HMAC-SHA256 Credential=AKIA/20260101/auto/s3/aws4_request, Signature=abcdef0123')).toBe('AWS4-HMAC-SHA256 Credential=[entfernt], Signature=[entfernt]');
    expect(new R2TransportError('k', `PUT fehlgeschlagen: Bearer ${TOKEN_A}`).message).not.toContain(TOKEN_A);
  });
});

describe('Wrangler-API-R2-Transport (bestehende OAuth-Anmeldung ohne Prozessstart)', () => {
  it('fehlende Objekte → null; Upload, Rücklesung und Listing über die Objekt-API; Konto aus der Anmeldung', async () => {
    const api = fakeApi();
    const transport = transportWith(api, {});
    const key = 'west/recht-nrw/2023-12-01/term-1/abc-version-page.html';
    expect(await transport.head(key)).toBeNull();
    const bytes = new TextEncoder().encode('<html>Fassung</html>');
    await transport.put(key, bytes, { contentType: 'text/html', metadata: {} });
    await transport.put(`${key}.envelope.json`, new Uint8Array([123, 125]), { contentType: 'application/json', metadata: {} });
    expect(await transport.get(key)).toEqual(bytes);
    expect((await transport.head(key))?.size).toBe(bytes.byteLength);
    expect(api.objects.get(key)?.contentType).toBe('text/html');
    const listed = await transport.list!('west/recht-nrw/2023-12-01/term-1/');
    expect(listed.map((object) => object.key).sort()).toEqual([key, `${key}.envelope.json`]);
    expect(listed[0]!.md5).toBe('0123456789abcdef0123456789abcdef');
    // Kontoermittlung genau einmal, danach nur Objektaufrufe; jede Anfrage trägt das Token der Anmeldung.
    expect(api.requests.filter((request) => request.path === '/client/v4/accounts')).toHaveLength(1);
    expect(api.requests.every((request) => request.token === TOKEN_A)).toBe(true);
  });

  it('bevorzugt CLOUDFLARE_API_TOKEN aus der Umgebung und liest dann keine Anmeldedatei', async () => {
    const api = fakeApi({ validTokens: [TOKEN_B] });
    let reads = 0;
    const transport = transportWith(api, { env: { CLOUDFLARE_API_TOKEN: TOKEN_B, CLOUDFLARE_ACCOUNT_ID: 'acc-1' }, readToken: async () => { reads += 1; return {}; } });
    await transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} });
    expect(reads).toBe(0);
    expect(api.requests.map((request) => request.path)).toEqual(['/client/v4/accounts/acc-1/r2/buckets/landesrecht-quellen/objects/k']);
  });

  it('nimmt ein von einem anderen Prozess rotiertes Token nach 401 ohne Erneuerung auf', async () => {
    const api = fakeApi({ validTokens: [TOKEN_B] });
    let refreshes = 0;
    const debug: string[] = [];
    const tokens = [TOKEN_A, TOKEN_B];
    const transport = transportWith(api, { accountId: 'acc-1', readToken: async () => ({ oauthToken: tokens.shift() ?? TOKEN_B, expirationTime: FUTURE }), refreshToken: async () => { refreshes += 1; }, debug });
    await transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} });
    expect(refreshes).toBe(0);
    expect(api.requests.map((request) => `${request.method}:${request.token === TOKEN_A ? 'A' : 'B'}`)).toEqual(['PUT:A', 'PUT:B']);
    expect(debug.join('\n')).not.toContain(TOKEN_A);
    expect(debug.join('\n')).not.toContain(TOKEN_B);
  });

  it('erneuert ein abgelaufenes Token vor dem ersten Aufruf genau einmal über Wrangler und wiederholt 429 mit Abstand', async () => {
    const api = fakeApi({ validTokens: [TOKEN_B], rateLimitOnce: true });
    let current = { oauthToken: TOKEN_A, expirationTime: PAST };
    let refreshes = 0;
    const transport = transportWith(api, { accountId: 'acc-1', readToken: async () => current, refreshToken: async () => { refreshes += 1; current = { oauthToken: TOKEN_B, expirationTime: FUTURE }; } });
    await transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} });
    expect(refreshes).toBe(1);
    expect(api.requests.map((request) => `${request.method}:${request.token === TOKEN_B ? 'B' : 'A'}`)).toEqual(['PUT:B', 'PUT:B']);
    expect(await transport.get('k')).toEqual(new Uint8Array([1]));
    expect(refreshes).toBe(1);
  });

  it('verwendet ein Token innerhalb der Sicherheitsmarge bis zum echten Ablauf weiter (whoami erneuert erst danach)', async () => {
    const api = fakeApi({ validTokens: [TOKEN_A, TOKEN_B] });
    let clock = Date.parse('2026-09-19T12:00:00.000Z');
    let current = { oauthToken: TOKEN_A, expirationTime: new Date(clock + 30_000).toISOString() };
    let refreshes = 0;
    const transport = transportWith(api, { accountId: 'acc-1', now: () => clock, readToken: async () => current, refreshToken: async () => { refreshes += 1; if (clock > Date.parse(current.expirationTime)) current = { oauthToken: TOKEN_B, expirationTime: new Date(clock + 3_600_000).toISOString() }; } });
    await transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} });
    await transport.put('k2', new Uint8Array([2]), { contentType: 'application/octet-stream', metadata: {} });
    expect(refreshes).toBe(1);
    clock += 60_000; // jetzt wirklich abgelaufen: Erneuerung liefert ein neues Token
    await transport.put('k3', new Uint8Array([3]), { contentType: 'application/octet-stream', metadata: {} });
    expect(refreshes).toBe(2);
    expect(api.requests.map((request) => request.token === TOKEN_B ? 'B' : 'A')).toEqual(['A', 'A', 'B']);
  });

  it('bricht nach erfolgloser Erneuerung mit klarer Meldung ab – keine Endlosschleife, kein weiterer Prozessstart', async () => {
    const api = fakeApi({ validTokens: [TOKEN_B] });
    let refreshes = 0;
    const transport = transportWith(api, { accountId: 'acc-1', readToken: async () => ({ oauthToken: TOKEN_A, expirationTime: FUTURE }), refreshToken: async () => { refreshes += 1; } });
    const first = await failure(transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} }));
    expect(first).toBeInstanceOf(WranglerAuthError);
    expect((first as WranglerAuthError).reason).toBe('expired');
    expect(first.message).toMatch(/npx wrangler login/u);
    expect(first.message).not.toContain(TOKEN_A);
    expect(refreshes).toBe(1);
    // Folgeaufrufe scheitern sofort mit derselben Meldung, ohne erneut Wrangler zu starten oder die API zu treffen.
    const requestsBefore = api.requests.length;
    const second = await failure(transport.get('k'));
    expect((second as WranglerAuthError).reason).toBe('expired');
    expect(refreshes).toBe(1);
    expect(api.requests.length).toBe(requestsBefore);
  });

  it('meldet Abmeldung (Datei ohne Token) und abgewiesenes CLOUDFLARE_API_TOKEN ohne Erneuerungsversuch', async () => {
    const api = fakeApi();
    let refreshes = 0;
    const loggedOut = transportWith(api, { accountId: 'acc-1', readToken: async () => ({}), refreshToken: async () => { refreshes += 1; } });
    const error = await failure(loggedOut.get('k'));
    expect((error as WranglerAuthError).reason).toBe('missing-token');
    expect(error.message).toMatch(/wrangler logout/u);
    expect(refreshes).toBe(0);
    const envToken = transportWith(api, { accountId: 'acc-1', env: { CLOUDFLARE_API_TOKEN: TOKEN_B }, refreshToken: async () => { refreshes += 1; } });
    const rejected = await failure(envToken.get('k'));
    expect((rejected as WranglerAuthError).reason).toBe('rejected');
    expect(rejected.message).toMatch(/CLOUDFLARE_API_TOKEN/u);
    expect(rejected.message).not.toContain(TOKEN_B);
    expect(refreshes).toBe(0);
  });

  it('bricht ohne CLOUDFLARE_ACCOUNT_ID bei mehreren oder keinem Konto ab (keine stille Auswahl)', async () => {
    const two = transportWith(fakeApi({ accounts: [{ id: 'acc-1', name: 'A' }, { id: 'acc-2', name: 'B' }] }), {});
    const error = await failure(two.get('k'));
    expect((error as WranglerAuthError).reason).toBe('accounts');
    expect(error.message).toMatch(/2 Cloudflare-Konten.*CLOUDFLARE_ACCOUNT_ID/u);
    const none = transportWith(fakeApi({ accounts: [] }), {});
    expect((await failure(none.get('k'))).message).toMatch(/kein Cloudflare-Konto/u);
    // Mit Konto aus der Umgebung findet keine Kontoermittlung statt.
    const api = fakeApi({ accountId: 'acc-2' });
    const chosen = transportWith(api, { env: { CLOUDFLARE_ACCOUNT_ID: 'acc-2' } });
    expect(await chosen.get('k')).toBeNull();
    expect(api.requests.some((request) => request.path === '/client/v4/accounts')).toBe(false);
  });

  it('wiederholt 5xx begrenzt und meldet danach einen Transportfehler ohne Rohkörper', async () => {
    const api = fakeApi({ serverErrors: 2 });
    const transport = transportWith(api, { accountId: 'acc-1' });
    expect(await transport.get('k')).toBeNull();
    expect(api.requests).toHaveLength(3);
    const persistent = transportWith(fakeApi({ serverErrors: 99 }), { accountId: 'acc-1' });
    const error = await failure(persistent.get('k'));
    expect(error).toBeInstanceOf(R2TransportError);
    expect((error as R2TransportError).status).toBe(502);
    expect(error.message).toMatch(/GET HTTP 502/u);
    expect(error.message).not.toContain('upstream');
  });

  it('bricht hängende Verbindungen nach dem Zeitlimit ab und wiederholt; danach ein Transportfehler', async () => {
    let calls = 0;
    const hanging = ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      calls += 1;
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as typeof fetch;
    const transport = createWranglerApiR2Transport({ bucket: 'landesrecht-quellen', accountId: 'acc-1', fetchImplementation: hanging, env: {}, readToken: async () => ({ oauthToken: TOKEN_A, expirationTime: FUTURE }), refreshToken: async () => undefined, timeoutMs: 5, retry: { sleep: noSleep, attempts: 3 } });
    const error = await failure(transport.get('k'));
    expect(error).toBeInstanceOf(R2TransportError);
    expect(error.message).toMatch(/keine vollständige Antwort innerhalb von 5 ms \(3 Versuche\)/u);
    expect(calls).toBe(3);
  });

  it('schreibt Diagnosezeilen ohne Token, Kopfzeilen oder Inhalte', async () => {
    const api = fakeApi();
    const debug: string[] = [];
    const transport = transportWith(api, { accountId: 'acc-1', debug });
    await transport.put('k', new TextEncoder().encode('geheimer inhalt'), { contentType: 'text/plain', metadata: {} });
    expect(debug).toHaveLength(1);
    expect(debug[0]).toMatch(/^PUT k Versuch 1 HTTP 200 \d+ ms$/u);
    expect(debug.join('\n')).not.toMatch(/geheimer inhalt|Bearer|fakeToken/u);
  });
});
