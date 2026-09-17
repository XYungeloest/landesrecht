/**
 * Zeitverhalten des RECHT.NRW-Fetchers: Das Timeout deckt Kopfzeilen und Körper; ein hängender Körper wird
 * als `timeout` klassifiziert, begrenzt wiederholt und endet dann mit verständlicher Meldung (Resume möglich,
 * kein hängender Lauf). Nur Fake-Fetch, kein Netz.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRechtNrwFetcher, readBodyWithSignal, RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function hangingBody(): Response {
  return new Response(new ReadableStream({ start() { /* Körper endet nie */ } }), { status: 200, headers: { 'content-type': 'text/html' } });
}

describe('Fetcher-Timeouts', () => {
  it('readBodyWithSignal bricht einen hängenden Körper beim Signal ab und liest sonst vollständig', async () => {
    const controller = new AbortController();
    const pending = readBodyWithSignal(hangingBody(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(new TextDecoder().decode(await readBodyWithSignal(new Response('ok'), new AbortController().signal))).toBe('ok');
    const already = new AbortController();
    already.abort();
    await expect(readBodyWithSignal(new Response('x'), already.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('klassifiziert einen nach den Kopfzeilen hängenden Körper als timeout, wiederholt begrenzt und gibt auf', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'recht-nrw-timeout-'));
    dirs.push(cacheDir);
    let calls = 0;
    const slept: number[] = [];
    const fetcher = createRechtNrwFetcher({ cacheDir, timeoutMs: 10, maxRetries: 2, minDelayMs: 0, sleep: async (ms) => { slept.push(ms); }, fetchImplementation: (async () => { calls += 1; return hangingBody(); }) as typeof fetch });
    const error = await fetcher.fetch('https://recht.nrw.de/lrgv/haengt').then(() => undefined, (caught: RechtNrwFetchError) => caught);
    expect(error).toBeInstanceOf(RechtNrwFetchError);
    expect(error!.kind).toBe('timeout');
    expect(error!.message).toMatch(/keine vollständige Antwort innerhalb von 10 ms/u);
    expect(calls).toBe(3);
    expect(slept).toEqual([2_000, 4_000]);
    expect(fetcher.stats.retries).toBe(2);
  });

  it('meldet ein Abbruchsignal während eines hängenden Körpers als interrupted (Lauf endet kontrolliert)', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'recht-nrw-timeout-'));
    dirs.push(cacheDir);
    const stop = new AbortController();
    const fetcher = createRechtNrwFetcher({ cacheDir, timeoutMs: 60_000, maxRetries: 3, minDelayMs: 0, signal: stop.signal, fetchImplementation: (async () => { setTimeout(() => stop.abort(), 5); return hangingBody(); }) as typeof fetch });
    await expect(fetcher.fetch('https://recht.nrw.de/lrgv/abbruch')).rejects.toMatchObject({ kind: 'interrupted' });
  });
});
