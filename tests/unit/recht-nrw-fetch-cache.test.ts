/**
 * Zentraler RECHT.NRW-Fetcher: Cache (Treffer, Metadaten, Refresh, Offline, Beschädigung, POST-Schlüssel),
 * Retry-After und Backoff, Sperrantworten, Timeouts, Budget, Mindestabstand und Abbruchsignal.
 * Ohne Netz: Fetch-Funktion, Schlaf und Uhren sind injiziert; der Cache liegt in temporären Verzeichnissen.
 */
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cacheKey, createRechtNrwFetcher, DEFAULT_MIN_DELAY_MS, parseRetryAfter, RechtNrwFetchError, sha256Hex, type FetcherOptions } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'recht-nrw-fetch-cache-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

interface StubCall {
  url: string;
  init: RequestInit | undefined;
}

type StubHandler = (url: string, call: number, init: RequestInit | undefined) => Response | Promise<Response>;

function stubFetch(handler: StubHandler): { fetch: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const implementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return handler(url, calls.length, init);
  }) as typeof fetch;
  return { fetch: implementation, calls };
}

function html(body: string, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=UTF-8', ...headers } });
}

/** Wartet auf das Abbruchsignal der Anfrage (Timeout oder Abbruch) und lehnt dann mit AbortError ab. */
function hangingResponse(init: RequestInit | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

const URL_A = 'https://recht.nrw.de/lrgv/gesetz/01012020-cache-a';
const URL_B = 'https://recht.nrw.de/lrgv/gesetz/01012020-cache-b';
const SEARCH = 'https://recht.nrw.de/search-middleware/opensearch_internet/_search';
const NOW = new Date('2026-09-15T12:00:00.000Z');

async function base(overrides: Partial<FetcherOptions> & { cacheDir?: string } = {}): Promise<FetcherOptions & { cacheDir: string; slept: number[] }> {
  const slept: number[] = [];
  return { cacheDir: overrides.cacheDir ?? (await tempDir()), minDelayMs: 0, sleep: async (ms: number) => { slept.push(ms); }, now: () => NOW, ...overrides, slept } as FetcherOptions & { cacheDir: string; slept: number[] };
}

async function rejection(promise: Promise<unknown>): Promise<RechtNrwFetchError> {
  return promise.then(
    () => {
      throw new Error('Abruf hätte fehlschlagen müssen');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(RechtNrwFetchError);
      return error as RechtNrwFetchError;
    },
  );
}

describe('RECHT.NRW-Fetcher: Cache', () => {
  it('Cache-Fehlabruf, dann Cache-Treffer ohne Netz (stats.cacheHits)', async () => {
    const options = await base();
    const stub = stubFetch(() => html('<html>eins</html>'));
    const fetcher = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    const first = await fetcher.fetch(URL_A);
    expect(first.fromCache).toBe(false);
    expect(fetcher.stats).toMatchObject({ networkRequests: 1, cacheHits: 0 });
    const second = await fetcher.fetch(URL_A);
    expect(second.fromCache).toBe(true);
    expect(Buffer.from(second.bytes).toString('utf8')).toBe('<html>eins</html>');
    expect(second.sha256).toBe(first.sha256);
    expect(stub.calls).toHaveLength(1);
    expect(fetcher.stats).toMatchObject({ networkRequests: 1, cacheHits: 1, bytesDownloaded: 17 });
    // Ein zweiter Fetcher über denselben Cache arbeitet ebenfalls netzfrei.
    const again = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    expect((await again.fetch(URL_A)).fromCache).toBe(true);
    expect(again.stats).toMatchObject({ networkRequests: 0, cacheHits: 1 });
    expect(stub.calls).toHaveLength(1);
  });

  it('speichert Cache-Metadaten: finale URL, Status, Content-Type, Abrufzeit, Bytelänge, SHA-256 und relevante Header', async () => {
    const options = await base();
    const body = '<html>Metadaten äöü</html>';
    const stub = stubFetch(() => {
      const response = html(body, { etag: '"abc"', 'last-modified': 'Mon, 14 Sep 2026 08:00:00 GMT', date: 'Tue, 15 Sep 2026 12:00:00 GMT', 'x-irrelevant': 'nein', 'set-cookie': 'geheim=1' });
      Object.defineProperty(response, 'url', { value: `${URL_A}-final` });
      return response;
    });
    const fetcher = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    const document = await fetcher.fetch(URL_A);
    const bytes = new TextEncoder().encode(body);
    expect(document).toMatchObject({ url: URL_A, finalUrl: `${URL_A}-final`, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: NOW.toISOString(), sha256: sha256Hex(bytes), fromCache: false });
    expect(document.method).toBeUndefined();

    const key = cacheKey(URL_A);
    expect(key).toBe(sha256Hex(URL_A).slice(0, 40));
    const metadata = JSON.parse(await readFile(join(options.cacheDir, `${key}.json`), 'utf8')) as Record<string, unknown>;
    expect(metadata).toEqual({
      url: URL_A,
      finalUrl: `${URL_A}-final`,
      status: 200,
      contentType: 'text/html; charset=UTF-8',
      retrievedAt: NOW.toISOString(),
      sha256: sha256Hex(bytes),
      byteLength: bytes.byteLength,
      headers: { etag: '"abc"', 'last-modified': 'Mon, 14 Sep 2026 08:00:00 GMT', date: 'Tue, 15 Sep 2026 12:00:00 GMT' },
    });
    expect(Buffer.compare(await readFile(join(options.cacheDir, `${key}.bin`)), Buffer.from(bytes))).toBe(0);
    expect((await readdir(options.cacheDir)).filter((file) => file.startsWith('.tmp-'))).toEqual([]);

    const cached = await createRechtNrwFetcher({ ...options, offline: true }).fetch(URL_A);
    expect(cached).toMatchObject({ url: URL_A, finalUrl: `${URL_A}-final`, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: NOW.toISOString(), sha256: sha256Hex(bytes), fromCache: true, headers: { etag: '"abc"' } });
    expect(cached.headers).not.toHaveProperty('x-irrelevant');
  });

  it('refresh ruft trotz Cache-Eintrag neu ab und ersetzt den Eintrag', async () => {
    const options = await base();
    let version = 1;
    const stub = stubFetch(() => html(`<html>Stand ${version}</html>`));
    const fetcher = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    const old = await fetcher.fetch(URL_A);
    version = 2;
    const refreshing = createRechtNrwFetcher({ ...options, refresh: true, fetchImplementation: stub.fetch });
    const fresh = await refreshing.fetch(URL_A);
    expect(fresh.fromCache).toBe(false);
    expect(fresh.sha256).not.toBe(old.sha256);
    expect(stub.calls).toHaveLength(2);
    expect(refreshing.stats).toMatchObject({ networkRequests: 1, cacheHits: 0 });
    // Im Refresh-Modus wird der Cache auch innerhalb desselben Fetchers nicht gelesen.
    await refreshing.fetch(URL_A);
    expect(stub.calls).toHaveLength(3);
    const offline = await createRechtNrwFetcher({ ...options, offline: true }).fetch(URL_A);
    expect(Buffer.from(offline.bytes).toString('utf8')).toBe('<html>Stand 2</html>');
  });

  it('meldet im Offline-Modus einen fehlenden Cache-Eintrag als Netzfehler ohne Abruf', async () => {
    const options = await base();
    const stub = stubFetch(() => html('nie'));
    const fetcher = createRechtNrwFetcher({ ...options, offline: true, fetchImplementation: stub.fetch });
    const error = await rejection(fetcher.fetch(URL_B));
    expect(error.kind).toBe('network');
    expect(error.message).toContain('Offline-Modus');
    expect(stub.calls).toHaveLength(0);
    expect(fetcher.stats).toMatchObject({ networkRequests: 0, cacheHits: 0 });
  });

  it('behandelt einen beschädigten Cache (manipulierte Bytes, SHA-256-Abweichung) online als Fehlabruf und offline als cache-corrupt', async () => {
    const options = await base();
    const stub = stubFetch(() => html('<html>original</html>'));
    await createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch }).fetch(URL_A);
    const binary = join(options.cacheDir, `${cacheKey(URL_A)}.bin`);
    await writeFile(binary, '<html>manipuliert</html>');

    const offline = createRechtNrwFetcher({ ...options, offline: true, fetchImplementation: stub.fetch });
    const error = await rejection(offline.fetch(URL_A));
    expect(error.kind).toBe('cache-corrupt');
    expect(offline.stats.cacheCorrupt).toBe(1);
    expect(stub.calls).toHaveLength(1);

    const online = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    const repaired = await online.fetch(URL_A);
    expect(repaired.fromCache).toBe(false);
    expect(Buffer.from(repaired.bytes).toString('utf8')).toBe('<html>original</html>');
    expect(online.stats).toMatchObject({ networkRequests: 1, cacheHits: 0, cacheCorrupt: 1 });
    expect(stub.calls).toHaveLength(2);
    // Der Neuabruf hat den Eintrag repariert.
    expect((await createRechtNrwFetcher({ ...options, offline: true }).fetch(URL_A)).fromCache).toBe(true);

    // Gleiche Länge, anderer Inhalt: ebenfalls erkannt.
    await writeFile(binary, '<html>ORIGINAL</html>');
    expect((await rejection(createRechtNrwFetcher({ ...options, offline: true }).fetch(URL_A))).kind).toBe('cache-corrupt');
  });

  it('bildet den POST-Cacheschlüssel aus Methode, URL und Körper', async () => {
    expect(cacheKey(SEARCH, { method: 'POST', body: '{"a":1}' })).not.toBe(cacheKey(SEARCH, { method: 'POST', body: '{"a":2}' }));
    expect(cacheKey(SEARCH, { method: 'POST', body: '{"a":1}' })).not.toBe(cacheKey(SEARCH));
    expect(cacheKey(SEARCH, { method: 'POST', body: '{"a":1}' })).toBe(sha256Hex(`POST\n${SEARCH}\n{"a":1}`).slice(0, 40));
    expect(cacheKey(SEARCH, { method: 'POST', body: '{"a":1}' })).toMatch(/^[a-f0-9]{40}$/u);
    expect(cacheKey(SEARCH, { accept: 'application/json' })).toBe(cacheKey(SEARCH));

    const options = await base();
    const stub = stubFetch((_url, _call, init) => new Response(JSON.stringify({ echo: init?.body }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const fetcher = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    const first = await fetcher.fetch(SEARCH, { method: 'POST', body: '{"a":1}', accept: 'application/json' });
    const second = await fetcher.fetch(SEARCH, { method: 'POST', body: '{"a":2}', accept: 'application/json' });
    expect(first.sha256).not.toBe(second.sha256);
    expect(first.method).toBe('POST');
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[0]!.init).toMatchObject({ method: 'POST', body: '{"a":1}', redirect: 'follow' });
    expect(stub.calls[0]!.init?.headers).toMatchObject({ 'content-type': 'application/json', accept: 'application/json', 'accept-language': 'de' });
    expect((stub.calls[0]!.init?.headers as Record<string, string>)['user-agent']).toBeTruthy();

    const repeated = await fetcher.fetch(SEARCH, { method: 'POST', body: '{"a":1}' });
    expect(repeated.fromCache).toBe(true);
    expect(repeated.method).toBe('POST');
    expect(repeated.sha256).toBe(first.sha256);
    expect(stub.calls).toHaveLength(2);
    const metadata = JSON.parse(await readFile(join(options.cacheDir, `${cacheKey(SEARCH, { method: 'POST', body: '{"a":1}' })}.json`), 'utf8')) as Record<string, unknown>;
    expect(metadata).toMatchObject({ method: 'POST', requestSha256: sha256Hex('{"a":1}') });
    // Ein GET auf dieselbe URL teilt den Eintrag nicht.
    await fetcher.fetch(SEARCH);
    expect(stub.calls).toHaveLength(3);
  });

  it('hält HTTP 404 im Negativ-Cache: Wiederholung und Offline-Lauf ohne Netz, refresh ruft neu ab, ein späterer Erfolg entfernt den Eintrag', async () => {
    const options = await base();
    let available = false;
    const stub = stubFetch(() => (available ? html('<html>jetzt da</html>') : html('fehlt', {}, 404)));
    const fetcher = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    expect(await rejection(fetcher.fetch(URL_A))).toMatchObject({ kind: 'not-found', status: 404 });
    expect(stub.calls).toHaveLength(1);
    const negative = join(options.cacheDir, `${cacheKey(URL_A)}.404.json`);
    expect(JSON.parse(await readFile(negative, 'utf8'))).toEqual({ url: URL_A, status: 404, retrievedAt: NOW.toISOString() });
    expect(await exists(join(options.cacheDir, `${cacheKey(URL_A)}.bin`))).toBe(false);
    expect(await exists(join(options.cacheDir, `${cacheKey(URL_A)}.json`))).toBe(false);

    // Wiederholung im selben Fetcher (bleibt nach dem Fehler benutzbar): netzfrei, als Cache-Treffer gezählt.
    expect(await rejection(fetcher.fetch(URL_A))).toMatchObject({ kind: 'not-found', status: 404 });
    expect(stub.calls).toHaveLength(1);
    expect(fetcher.stats).toMatchObject({ networkRequests: 1, cacheHits: 1 });

    const offline = createRechtNrwFetcher({ ...options, offline: true, fetchImplementation: stub.fetch });
    expect(await rejection(offline.fetch(URL_A))).toMatchObject({ kind: 'not-found', status: 404 });
    expect(offline.stats).toMatchObject({ networkRequests: 0, cacheHits: 1 });
    // Der Negativ-Eintrag gilt je Cacheschlüssel: andere URL oder POST-Körper bleiben „nicht im Cache“.
    expect((await rejection(offline.fetch(URL_B))).kind).toBe('network');
    expect((await rejection(offline.fetch(URL_A, { method: 'POST', body: '{}' }))).kind).toBe('network');
    expect(stub.calls).toHaveLength(1);

    const refreshing = createRechtNrwFetcher({ ...options, refresh: true, fetchImplementation: stub.fetch });
    expect((await rejection(refreshing.fetch(URL_A))).kind).toBe('not-found');
    expect(stub.calls).toHaveLength(2);
    expect(refreshing.stats).toMatchObject({ networkRequests: 1, cacheHits: 0 });

    available = true;
    const recovered = await createRechtNrwFetcher({ ...options, refresh: true, fetchImplementation: stub.fetch }).fetch(URL_A);
    expect(recovered.fromCache).toBe(false);
    expect(stub.calls).toHaveLength(3);
    expect(await exists(negative)).toBe(false);
    expect((await createRechtNrwFetcher({ ...options, offline: true }).fetch(URL_A)).fromCache).toBe(true);
    expect((await readdir(options.cacheDir)).filter((file) => file.startsWith('.tmp-'))).toEqual([]);
  });
});

describe('RECHT.NRW-Fetcher: Retry-After, Sperren und Timeouts', () => {
  it('parst Retry-After in Sekunden und als HTTP-Datum (parseRetryAfter)', () => {
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
    expect(parseRetryAfter('', NOW)).toBeUndefined();
    expect(parseRetryAfter('120', NOW)).toBe(120_000);
    expect(parseRetryAfter(' 5 ', NOW)).toBe(5_000);
    expect(parseRetryAfter('0', NOW)).toBe(0);
    expect(parseRetryAfter('Tue, 15 Sep 2026 12:00:30 GMT', NOW)).toBe(30_000);
    expect(parseRetryAfter('Tue, 15 Sep 2026 11:59:00 GMT', NOW)).toBe(0);
    expect(parseRetryAfter('irgendwann', NOW)).toBeUndefined();
  });

  it('respektiert Retry-After beim Backoff über den injizierten Schlaf', async () => {
    const seconds = await base();
    const secondsStub = stubFetch((_url, call) => (call === 1 ? html('', { 'retry-after': '10' }, 429) : html('<html>ok</html>')));
    const secondsFetcher = createRechtNrwFetcher({ ...seconds, fetchImplementation: secondsStub.fetch });
    expect((await secondsFetcher.fetch(URL_A)).status).toBe(200);
    // 429: Backoff 4 s (verdoppelt), das längere Retry-After von 10 s hat Vorrang.
    expect(seconds.slept).toEqual([10_000]);
    expect(secondsFetcher.stats).toMatchObject({ networkRequests: 2, retries: 1, blockedResponses: 1 });

    const short = await base();
    const shortStub = stubFetch((_url, call) => (call === 1 ? html('', { 'retry-after': '1' }, 429) : html('<html>ok</html>')));
    await createRechtNrwFetcher({ ...short, fetchImplementation: shortStub.fetch }).fetch(URL_A);
    expect(short.slept).toEqual([4_000]);

    const date = await base();
    const dateStub = stubFetch((_url, call) => (call === 1 ? html('', { 'retry-after': 'Tue, 15 Sep 2026 12:00:30 GMT' }, 503) : html('<html>ok</html>')));
    await createRechtNrwFetcher({ ...date, fetchImplementation: dateStub.fetch }).fetch(URL_A);
    expect(date.slept).toEqual([30_000]);
  });

  it('zählt 429 als Sperrantwort und bricht nach maxConsecutiveBlocks mit blocked ab', async () => {
    const options = await base();
    const stub = stubFetch(() => html('gesperrt', { 'retry-after': '1' }, 429));
    const fetcher = createRechtNrwFetcher({ ...options, maxRetries: 10, maxConsecutiveBlocks: 3, fetchImplementation: stub.fetch });
    const error = await rejection(fetcher.fetch(URL_A));
    expect(error.kind).toBe('blocked');
    expect(error.status).toBe(429);
    expect(stub.calls).toHaveLength(3);
    expect(options.slept).toEqual([4_000, 8_000]);
    expect(fetcher.stats).toMatchObject({ networkRequests: 3, blockedResponses: 3, retries: 2 });
  });

  it('zählt 403 als Sperrantwort (ohne Wiederholung) und bricht erst nach aufeinanderfolgenden Sperren ab', async () => {
    const options = await base();
    const statuses = [403, 200, 403, 403, 403];
    const stub = stubFetch((_url, call) => html('x', {}, statuses[call - 1] ?? 200));
    const fetcher = createRechtNrwFetcher({ ...options, maxConsecutiveBlocks: 3, fetchImplementation: stub.fetch });
    expect((await rejection(fetcher.fetch(`${URL_A}-1`))).kind).toBe('forbidden');
    expect((await fetcher.fetch(`${URL_A}-2`)).status).toBe(200);
    expect((await rejection(fetcher.fetch(`${URL_A}-3`))).kind).toBe('forbidden');
    expect((await rejection(fetcher.fetch(`${URL_A}-4`))).kind).toBe('forbidden');
    const blocked = await rejection(fetcher.fetch(`${URL_A}-5`));
    expect(blocked.kind).toBe('blocked');
    expect(blocked.status).toBe(403);
    expect(options.slept).toEqual([]);
    expect(fetcher.stats).toMatchObject({ networkRequests: 5, blockedResponses: 4, retries: 0 });
  });

  it('wartet ein zu langes Retry-After nicht ab (maxRetryAfterMs), sondern beendet mit blocked', async () => {
    const options = await base();
    const stub = stubFetch(() => html('', { 'retry-after': '3600' }, 429));
    const fetcher = createRechtNrwFetcher({ ...options, maxRetryAfterMs: 120_000, maxConsecutiveBlocks: 10, maxRetries: 5, fetchImplementation: stub.fetch });
    const error = await rejection(fetcher.fetch(URL_A));
    expect(error.kind).toBe('blocked');
    expect(error.retryAfterMs).toBe(3_600_000);
    expect(stub.calls).toHaveLength(1);
    expect(options.slept).toEqual([]);

    const server = await base();
    const serverStub = stubFetch(() => html('', { 'retry-after': '301' }, 503));
    const serverFetcher = createRechtNrwFetcher({ ...server, maxRetryAfterMs: 300_000, fetchImplementation: serverStub.fetch });
    expect((await rejection(serverFetcher.fetch(URL_A))).kind).toBe('blocked');
    expect(serverFetcher.stats.blockedResponses).toBe(0);

    const within = await base();
    const withinStub = stubFetch((_url, call) => (call === 1 ? html('', { 'retry-after': '300' }, 503) : html('ok')));
    await createRechtNrwFetcher({ ...within, maxRetryAfterMs: 300_000, fetchImplementation: withinStub.fetch }).fetch(URL_A);
    expect(within.slept).toEqual([300_000]);
  });

  it('wiederholt nach einem Timeout und nach Netzfehlern', async () => {
    const options = await base();
    const stub = stubFetch((_url, call, init) => (call === 1 ? hangingResponse(init) : html('<html>spät</html>')));
    const fetcher = createRechtNrwFetcher({ ...options, timeoutMs: 5, maxRetries: 2, fetchImplementation: stub.fetch });
    const document = await fetcher.fetch(URL_A);
    expect(Buffer.from(document.bytes).toString('utf8')).toBe('<html>spät</html>');
    expect(stub.calls).toHaveLength(2);
    expect(options.slept).toEqual([2_000]);
    expect(fetcher.stats).toMatchObject({ networkRequests: 2, retries: 1, blockedResponses: 0 });

    const exhausted = await base();
    const hanging = stubFetch((_url, _call, init) => hangingResponse(init));
    const slow = createRechtNrwFetcher({ ...exhausted, timeoutMs: 5, maxRetries: 1, fetchImplementation: hanging.fetch });
    expect((await rejection(slow.fetch(URL_A))).kind).toBe('timeout');
    expect(hanging.calls).toHaveLength(2);

    const network = await base();
    const broken = stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    const offlineNet = createRechtNrwFetcher({ ...network, maxRetries: 2, fetchImplementation: broken.fetch });
    const error = await rejection(offlineNet.fetch(URL_A));
    expect(error.kind).toBe('network');
    expect(broken.calls).toHaveLength(3);
    expect(network.slept).toEqual([2_000, 4_000]);
  });
});

describe('RECHT.NRW-Fetcher: Budget, Mindestabstand und Abbruch', () => {
  it('Budget: maxRequests beendet mit budget-exhausted; Cache-Treffer zählen nicht', async () => {
    const options = await base();
    const stub = stubFetch((url) => html(`<html>${url}</html>`));
    const fetcher = createRechtNrwFetcher({ ...options, budget: { maxRequests: 2 }, fetchImplementation: stub.fetch });
    await fetcher.fetch(`${URL_A}-1`);
    await fetcher.fetch(`${URL_A}-2`);
    const error = await rejection(fetcher.fetch(`${URL_A}-3`));
    expect(error.kind).toBe('budget-exhausted');
    expect(error.message).toContain('2 Netzabrufen');
    expect(stub.calls).toHaveLength(2);
    expect((await fetcher.fetch(`${URL_A}-1`)).fromCache).toBe(true);
    expect(fetcher.stats).toMatchObject({ networkRequests: 2, cacheHits: 1 });
  });

  it('Budget: Wiederholungen verbrauchen das Abrufbudget', async () => {
    const options = await base();
    const stub = stubFetch(() => html('', {}, 503));
    const fetcher = createRechtNrwFetcher({ ...options, maxRetries: 5, budget: { maxRequests: 2 }, fetchImplementation: stub.fetch });
    expect((await rejection(fetcher.fetch(URL_A))).kind).toBe('budget-exhausted');
    expect(stub.calls).toHaveLength(2);
  });

  it('Budget: maxBytes und maxRuntimeMs beenden mit budget-exhausted', async () => {
    const bytes = await base();
    const bytesStub = stubFetch(() => html('0123456789'));
    const byteFetcher = createRechtNrwFetcher({ ...bytes, budget: { maxBytes: 15 }, fetchImplementation: bytesStub.fetch });
    await byteFetcher.fetch(`${URL_A}-1`);
    await byteFetcher.fetch(`${URL_A}-2`);
    const byteError = await rejection(byteFetcher.fetch(`${URL_A}-3`));
    expect(byteError.kind).toBe('budget-exhausted');
    expect(byteError.message).toContain('15 Bytes');
    expect(byteFetcher.stats.bytesDownloaded).toBe(20);
    expect(bytesStub.calls).toHaveLength(2);

    let time = 1_000_000;
    const runtime = await base();
    const runtimeStub = stubFetch(() => html('ok'));
    const runtimeFetcher = createRechtNrwFetcher({ ...runtime, clock: () => time, budget: { maxRuntimeMs: 60_000 }, fetchImplementation: runtimeStub.fetch });
    time += 59_999;
    await runtimeFetcher.fetch(`${URL_A}-1`);
    time += 1;
    const runtimeError = await rejection(runtimeFetcher.fetch(`${URL_A}-2`));
    expect(runtimeError.kind).toBe('budget-exhausted');
    expect(runtimeError.message).toContain('Laufzeitbudget');
    expect(runtimeStub.calls).toHaveLength(1);
  });

  it('hält den Mindestabstand zwischen Netzabrufen ein (injizierte Uhr und Schlaf), nicht aber vor Cache-Treffern', async () => {
    let time = 0;
    const slept: number[] = [];
    const cacheDir = await tempDir();
    const starts: number[] = [];
    const stub = stubFetch(() => {
      starts.push(time);
      time += 100;
      return html('<html>x</html>');
    });
    const fetcher = createRechtNrwFetcher({ cacheDir, clock: () => time, sleep: async (ms) => { slept.push(ms); time += ms; }, now: () => NOW, fetchImplementation: stub.fetch });
    await fetcher.fetch(`${URL_A}-1`);
    await fetcher.fetch(`${URL_A}-2`);
    time += 1_000;
    await fetcher.fetch(`${URL_A}-3`);
    await fetcher.fetch(`${URL_A}-1`);
    time += 5_000;
    await fetcher.fetch(`${URL_A}-4`);
    expect(DEFAULT_MIN_DELAY_MS).toBe(1_500);
    expect(starts).toEqual([0, 1_500, 3_000, 8_100]);
    expect(slept).toEqual([1_400, 400]);
    for (let index = 1; index < starts.length; index += 1) expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(DEFAULT_MIN_DELAY_MS);
    expect(fetcher.stats).toMatchObject({ networkRequests: 4, cacheHits: 1 });

    // Eigener Mindestabstand; Backoff-Schlaf zählt auf den Abstand an.
    time = 0;
    slept.length = 0;
    starts.length = 0;
    let call = 0;
    const retrying = stubFetch(() => {
      starts.push(time);
      call += 1;
      return call === 1 ? html('', {}, 503) : html('ok');
    });
    const custom = createRechtNrwFetcher({ cacheDir, minDelayMs: 3_000, clock: () => time, sleep: async (ms) => { slept.push(ms); time += ms; }, fetchImplementation: retrying.fetch });
    await custom.fetch(`${URL_B}-1`);
    await custom.fetch(`${URL_B}-2`);
    expect(starts).toEqual([0, 3_000, 6_000]);
    expect(slept).toEqual([2_000, 1_000, 3_000]);
  });

  it('bricht bei gesetztem Abbruchsignal mit interrupted ab – vor dem Abruf und während eines laufenden Abrufs', async () => {
    const options = await base();
    const before = new AbortController();
    const stub = stubFetch(() => html('<html>ok</html>'));
    const warm = createRechtNrwFetcher({ ...options, fetchImplementation: stub.fetch });
    await warm.fetch(URL_A);
    before.abort();
    const aborted = createRechtNrwFetcher({ ...options, signal: before.signal, fetchImplementation: stub.fetch });
    expect((await rejection(aborted.fetch(URL_B))).kind).toBe('interrupted');
    expect(stub.calls).toHaveLength(1);
    expect(aborted.stats.networkRequests).toBe(0);
    // Cache-Einträge bleiben lesbar.
    expect((await aborted.fetch(URL_A)).fromCache).toBe(true);

    const during = new AbortController();
    const hanging = stubFetch((_url, _call, init) => {
      setTimeout(() => during.abort(), 1);
      return hangingResponse(init);
    });
    const inFlight = createRechtNrwFetcher({ ...options, signal: during.signal, timeoutMs: 60_000, maxRetries: 3, fetchImplementation: hanging.fetch });
    const error = await rejection(inFlight.fetch(`${URL_B}-laufend`));
    expect(error.kind).toBe('interrupted');
    expect(hanging.calls).toHaveLength(1);
    expect(inFlight.stats.retries).toBe(0);
    expect(options.slept).toEqual([]);
  });
});
