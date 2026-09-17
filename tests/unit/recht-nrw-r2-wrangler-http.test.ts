/**
 * Netzpfade der R2-Transporte: hartes Zeitlimit über Kopfzeilen und Körper, begrenzte Wiederholungen mit
 * Retry-After (gedeckelt), S3-Transport mit Timeout/Retry, Wrangler-Prozess mit Zeitlimit. Nur Fakes.
 */
import { describe, expect, it } from 'vitest';

import { createS3R2Transport, createWranglerR2Transport, fetchBounded, HttpRequestError, R2TransportError, requestWithRetries, WRANGLER_CALL_TIMEOUT_MS, type BoundedResponse } from '../../packages/importers/recht-nrw/src/common/r2-transport.ts';

const noSleep = async (): Promise<void> => undefined;
const response = (status: number, body = '', headers: Record<string, string> = {}): BoundedResponse => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), bytes: new TextEncoder().encode(body) });

/** Antwort, deren Kopfzeilen sofort kommen und deren Körper nie endet. */
function hangingBodyFetch(): typeof fetch {
  return (async () => new Response(new ReadableStream({ start() { /* nie schließen */ } }), { status: 200 })) as typeof fetch;
}

describe('fetchBounded', () => {
  it('bricht einen Körper ab, der nach den Kopfzeilen hängt (Zeitlimit deckt Kopf und Körper)', async () => {
    const error = await fetchBounded(hangingBodyFetch(), 'https://example.invalid/x', { method: 'GET' }, 10).then(() => undefined, (caught: Error) => caught);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect((error as HttpRequestError).kind).toBe('timeout');
  });

  it('liefert Status, Kopfzeilen und Bytes; Netzfehler werden klassifiziert', async () => {
    const ok = await fetchBounded((async () => new Response('hallo', { status: 201, headers: { etag: '"x"' } })) as typeof fetch, 'https://example.invalid/x', {}, 1_000);
    expect(ok).toMatchObject({ status: 201, ok: true });
    expect(new TextDecoder().decode(ok.bytes)).toBe('hallo');
    expect(ok.headers.get('etag')).toBe('"x"');
    const network = await fetchBounded((async () => { throw new TypeError('fetch failed'); }) as typeof fetch, 'https://example.invalid/x', {}, 1_000).then(() => undefined, (caught: Error) => caught);
    expect((network as HttpRequestError).kind).toBe('network');
  });
});

describe('requestWithRetries', () => {
  it('wiederholt 429 und 5xx mit Retry-After (gedeckelt) und gibt andere Antworten unverändert zurück', async () => {
    const slept: number[] = [];
    const answers = [response(429, '', { 'retry-after': '3' }), response(503, '', { 'retry-after': '99999' }), response(404)];
    const result = await requestWithRetries('k', 'GET', async () => answers.shift()!, { sleep: async (ms) => { slept.push(ms); }, delayMs: 1_000, maxRetryAfterMs: 5_000 });
    expect(result.status).toBe(404);
    expect(slept).toEqual([3_000, 5_000]);
  });

  it('gibt nach der letzten Wiederholung die 5xx-Antwort zurück und wandelt Netzfehler in Transportfehler', async () => {
    let calls = 0;
    const last = await requestWithRetries('k', 'GET', async () => { calls += 1; return response(500); }, { sleep: noSleep, attempts: 3 });
    expect(last.status).toBe(500);
    expect(calls).toBe(3);
    const error = await requestWithRetries('k', 'PUT', async () => { throw new HttpRequestError('network', 'ECONNRESET'); }, { sleep: noSleep, attempts: 2 }).then(() => undefined, (caught: Error) => caught);
    expect(error).toBeInstanceOf(R2TransportError);
    expect(error!.message).toBe('R2 k: PUT: ECONNRESET (2 Versuche)');
    // Fremde Fehler (z. B. Anmeldung) werden nicht wiederholt.
    await expect(requestWithRetries('k', 'GET', async () => { throw new Error('andere Ursache'); }, { sleep: noSleep })).rejects.toThrow('andere Ursache');
  });
});

describe('S3-Transport mit Zeitlimit und Wiederholung', () => {
  it('wiederholt 503 und signiert jeden Versuch neu; hängende Verbindungen enden als Transportfehler', async () => {
    const seen: string[] = [];
    let failures = 1;
    const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)['x-amz-date']!);
      if (failures > 0) { failures -= 1; return new Response('', { status: 503 }); }
      return new Response('', { status: 200, headers: { 'content-length': '3', 'x-amz-meta-sha256': 'abc' } });
    }) as typeof fetch;
    let tick = 0;
    const transport = createS3R2Transport({ accountId: 'acc', accessKeyId: 'FAKEKEYID', secretAccessKey: 'FAKESECRET', bucket: 'b', fetchImplementation, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)), retry: { sleep: noSleep } });
    expect(await transport.head('k')).toMatchObject({ size: 3, sha256: 'abc' });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe('20260101T000000Z');
    expect(seen[1]).not.toBe(seen[0]);
    const hanging = createS3R2Transport({ accountId: 'acc', accessKeyId: 'FAKEKEYID', secretAccessKey: 'FAKESECRET', bucket: 'b', fetchImplementation: hangingBodyFetch(), timeoutMs: 5, retry: { sleep: noSleep, attempts: 2 } });
    const error = await hanging.get('k').then(() => undefined, (caught: Error) => caught);
    expect(error).toBeInstanceOf(R2TransportError);
    expect(error!.message).toMatch(/S3 GET: keine vollständige Antwort innerhalb von 5 ms \(2 Versuche\)/u);
    expect(error!.message).not.toContain('FAKESECRET');
  });
});

describe('Wrangler-Prozess-Transport mit Zeitlimit', () => {
  it('beendet hängende Wrangler-Prozesse nach dem Zeitlimit, wiederholt begrenzt und meldet dann klar', async () => {
    const timeouts: Array<number | undefined> = [];
    const exec = async (_file: string, _args: string[], options: { timeout?: number }): Promise<{ stdout: string; stderr: string }> => {
      timeouts.push(options.timeout);
      throw Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM', stderr: '' });
    };
    const transport = createWranglerR2Transport({ bucket: 'landesrecht-quellen', exec, sleep: noSleep, timeoutMs: 1_234 });
    const error = await transport.put('k', new Uint8Array([1]), { contentType: 'application/octet-stream', metadata: {} }).then(() => undefined, (caught: Error) => caught);
    expect(error).toBeInstanceOf(R2TransportError);
    expect(error!.message).toMatch(/wrangler put: Zeitüberschreitung: Wrangler-Prozess nach 1 s beendet/u);
    expect(timeouts).toEqual([1_234, 1_234, 1_234, 1_234]);
    expect(WRANGLER_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
