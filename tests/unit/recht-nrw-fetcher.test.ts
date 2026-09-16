import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRechtNrwFetcher, decodeHtml, RechtNrwFetchError, sha256Hex } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'recht-nrw-cache-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function fakeFetch(handler: (url: string, attempt: number) => Response | Promise<Response>): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const implementation = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return handler(url, calls.filter((entry) => entry === url).length);
  }) as typeof fetch;
  return { fetch: implementation, calls };
}

const noSleep = async (): Promise<void> => undefined;

describe('Schonender Fetcher', () => {
  it('liefert Bytes, SHA-256, finale URL, Content-Type und bedient Wiederholungen aus dem Cache', async () => {
    const cacheDir = await tempDir();
    const { fetch: implementation, calls } = fakeFetch(() => new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } }));
    const fetcher = createRechtNrwFetcher({ cacheDir, fetchImplementation: implementation, sleep: noSleep, minDelayMs: 0, now: () => new Date('2026-09-15T10:00:00Z') });
    const first = await fetcher.fetch('https://recht.nrw.de/lrgv/gesetz/01012020-test');
    expect(first.sha256).toBe(sha256Hex(new TextEncoder().encode('<html>ok</html>')));
    expect(first.contentType).toBe('text/html; charset=UTF-8');
    expect(first.retrievedAt).toBe('2026-09-15T10:00:00.000Z');
    expect(first.fromCache).toBe(false);
    expect(decodeHtml(first)).toBe('<html>ok</html>');
    const second = await fetcher.fetch('https://recht.nrw.de/lrgv/gesetz/01012020-test');
    expect(second.fromCache).toBe(true);
    expect(second.sha256).toBe(first.sha256);
    expect(calls).toHaveLength(1);
    expect(fetcher.stats).toMatchObject({ networkRequests: 1, cacheHits: 1, retries: 0, blockedResponses: 0 });
    const offline = createRechtNrwFetcher({ cacheDir, offline: true, fetchImplementation: implementation, sleep: noSleep, minDelayMs: 0 });
    expect((await offline.fetch('https://recht.nrw.de/lrgv/gesetz/01012020-test')).fromCache).toBe(true);
    await expect(offline.fetch('https://recht.nrw.de/lrgv/gesetz/01012021-neu')).rejects.toMatchObject({ kind: 'network' });
  });

  it('wiederholt bei 503 mit Backoff und gibt danach auf', async () => {
    const cacheDir = await tempDir();
    const slept: number[] = [];
    const { fetch: implementation } = fakeFetch((_url, attempt) => new Response('', { status: attempt < 3 ? 503 : 200, headers: { 'content-type': 'text/html' } }));
    const fetcher = createRechtNrwFetcher({ cacheDir, fetchImplementation: implementation, sleep: async (ms) => { slept.push(ms); }, minDelayMs: 0, maxRetries: 3 });
    const document = await fetcher.fetch('https://recht.nrw.de/a');
    expect(document.status).toBe(200);
    expect(slept).toEqual([2000, 4000]);
    const { fetch: failing } = fakeFetch(() => new Response('', { status: 503 }));
    const strict = createRechtNrwFetcher({ cacheDir, fetchImplementation: failing, sleep: noSleep, minDelayMs: 0, maxRetries: 1 });
    await expect(strict.fetch('https://recht.nrw.de/b')).rejects.toMatchObject({ kind: 'http', status: 503 });
  });

  it('klassifiziert 429, 403, 404, Timeouts und unsichere URLs', async () => {
    const cacheDir = await tempDir();
    const status = async (code: number): Promise<RechtNrwFetchError> => {
      const { fetch: implementation } = fakeFetch(() => new Response('', { status: code }));
      const fetcher = createRechtNrwFetcher({ cacheDir, fetchImplementation: implementation, sleep: noSleep, minDelayMs: 0, maxRetries: 0 });
      return fetcher.fetch(`https://recht.nrw.de/status/${code}`).then(() => { throw new Error('unerwartet'); }, (error: RechtNrwFetchError) => error);
    };
    expect((await status(429)).kind).toBe('rate-limited');
    expect((await status(403)).kind).toBe('forbidden');
    expect((await status(404)).kind).toBe('not-found');
    const timeout = createRechtNrwFetcher({ cacheDir, timeoutMs: 5, maxRetries: 0, minDelayMs: 0, sleep: noSleep, fetchImplementation: ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); })) as typeof fetch });
    await expect(timeout.fetch('https://recht.nrw.de/slow')).rejects.toMatchObject({ kind: 'timeout' });
    const plain = createRechtNrwFetcher({ cacheDir, fetchImplementation: fakeFetch(() => new Response('')).fetch, sleep: noSleep, minDelayMs: 0 });
    await expect(plain.fetch('http://recht.nrw.de/unsicher')).rejects.toMatchObject({ kind: 'invalid-url' });
  });

  it('führt Abrufe nacheinander mit Mindestabstand aus', async () => {
    const cacheDir = await tempDir();
    const order: string[] = [];
    const { fetch: implementation } = fakeFetch(async (url) => { order.push(`start ${url}`); await new Promise((resolve) => setTimeout(resolve, 5)); order.push(`end ${url}`); return new Response('x', { status: 200 }); });
    const fetcher = createRechtNrwFetcher({ cacheDir, fetchImplementation: implementation, sleep: noSleep, minDelayMs: 0 });
    await Promise.all([fetcher.fetch('https://recht.nrw.de/1'), fetcher.fetch('https://recht.nrw.de/2')]);
    expect(order).toEqual(['start https://recht.nrw.de/1', 'end https://recht.nrw.de/1', 'start https://recht.nrw.de/2', 'end https://recht.nrw.de/2']);
  });
});
