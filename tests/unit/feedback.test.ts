import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import { getFeedback, listFeedback, updateFeedback, deleteFeedback, FEEDBACK_LIMITS, assertFeedbackDatabase } from '@landesrecht/runtime/feedback.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';
import { getFeedbackUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { norm, paragraph } from '../helpers/fixture-corpus.ts';
import { resolveFeedbackContext } from '../../apps/web/src/lib/feedback/context.ts';
import { feedbackConfig, feedbackSession, issueFeedbackTicket, verifyFeedbackTicket, FEEDBACK_COOKIE, FEEDBACK_TTL_SECONDS } from '../../apps/web/src/lib/feedback/security.ts';
import { submitFeedback } from '../../apps/web/src/lib/feedback/submit.ts';
import { secureResponse, FEEDBACK_CSP, SECURITY_HEADERS } from '../../apps/web/src/lib/security-headers.ts';

const origin = 'https://landesrecht.example';
const csrfSecret = 'c'.repeat(32);
const now = Date.now();
const record = norm({ jurisdiction: 'west', slug: 'hinweis-west', versions: [
  { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: '2026-04-30', body: [paragraph('§ 1', 'Zweck', 'Alte Fassung.')] },
  { versionId: '2026-05-01', simulationValidFrom: '2026-05-01', body: [paragraph('§ 1', 'Zweck', 'Neue Fassung.')] },
] });
const registry = createStoreRegistry({ west: createFileNormStore('west', [record]) });
const context = (path: string, base: string) => resolveFeedbackContext(path, base, async () => registry);
let db: SqliteD1Database;
let ticket: Awaited<ReturnType<typeof issueFeedbackTicket>>;
const limiter = { limit: vi.fn(async (_input: { key: string }) => ({ success: true })) };
const siteverify = vi.fn<typeof fetch>(async () => Response.json({ success: true, hostname: 'landesrecht.example', action: 'feedback' }));
const env = (): Record<string, unknown> => ({ FEEDBACK_ENABLED: 'true', FEEDBACK_PRIVACY_APPROVED: 'true', FEEDBACK_ORIGIN: origin, TURNSTILE_SITE_KEY: 'feedback-sitekey-12345', TURNSTILE_SECRET_KEY: 'turnstile-secret-fixture-only', FEEDBACK_CSRF_SECRET: csrfSecret, FEEDBACK_RATE_SECRET: 'r'.repeat(32), LANDESRECHT_FEEDBACK: db, FEEDBACK_RATE_LIMITER: limiter });
const request = (values: Record<string, string | undefined> = {}, headers: Record<string, string | undefined> = {}) => new Request(`${origin}/fehler-melden/`, {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', cookie: `${FEEDBACK_COOKIE}=${ticket.session}`, 'cf-connecting-ip': '192.0.2.10', ...Object.fromEntries(Object.entries(headers).filter(([,value]) => value !== undefined)) },
  body: new URLSearchParams({ category: 'wording', description: 'Hier fehlt ein Satzzeichen.', email: '', page: '/west/norm/hinweis-west/', csrf: ticket.token, website: '', 'cf-turnstile-response': 'fixture-token', ...Object.fromEntries(Object.entries(values).filter(([,value]) => value !== undefined)) }),
});
const submit = (r = request(), e = env()) => submitFeedback(r, e, { context, fetch: siteverify, now: () => now });
const count = () => Number(db.native.prepare('SELECT count(*) AS n FROM feedback_reports').get()!.n);
beforeEach(async () => { db = await openSqliteD1(':memory:', { migrationsDir: join(process.cwd(), 'data/feedback') }); ticket = await issueFeedbackTicket(csrfSecret, null, now); limiter.limit.mockReset().mockResolvedValue({ success: true }); siteverify.mockReset().mockImplementation(async () => Response.json({ success: true, hostname: 'landesrecht.example', action: 'feedback' })); });
afterEach(() => db.close());

describe('bereinigter und geprüfter Seitenbezug', () => {
  it('bindet geltende und historische Norm sowie einzelne Vorschrift an die tatsächlich gelesene Fassung', async () => {
    expect(await context('/west/norm/hinweis-west/', origin)).toMatchObject({ norm: 'hinweis-west', jurisdiction: 'west', version: '2026-05-01', path: '/west/norm/hinweis-west/version/2026-05-01/' });
    expect(await context('/west/norm/hinweis-west/version/2023-12-01/paragraph-1/?mark=paragraph-1&textmark=geheim#auswahl', origin)).toEqual({ jurisdiction: 'west', norm: 'hinweis-west', version: '2023-12-01', provision: 'paragraph-1', path: '/west/norm/hinweis-west/version/2023-12-01/paragraph-1/' });
  });
  it('verwirft Suchbegriffe und Textmarker bereits im Link und erneut bei der Auflösung', async () => {
    expect(getFeedbackUrl('/suche/?q=vertraulich&textmark=geheim#auswahl')).toBe('/fehler-melden/?seite=%2Fsuche%2F');
    expect(await context('/suche/?q=vertraulich&mark=auswahl', origin)).toMatchObject({ path: '/suche/', norm: null });
    expect(getFeedbackUrl('//evil.example/')).toBe('/fehler-melden/');
  });
  it.each(['https://evil.example/west/norm/hinweis-west/', '//evil.example/', '/west//norm/hinweis-west/', '/west/norm/../hinweis-west/', '/west/norm/%2e%2e/', '/west/norm/hinweis-west/version/1900-01-01/', '/west/norm/hinweis-west/paragraph-99/', '/west/norm/unbekannt/', '/api/v1/norms/west/hinweis-west', '/west/norm/hinweis-west/paragraph-1/extra/', 'javascript:alert(1)'])('lehnt unbekannte oder fremde Adresse ab: %s', async path => { await expect(context(path, origin)).rejects.toThrow(); });
  it('akzeptiert allgemeine Meldung ohne vorhandene Norm', async () => {
    const result = await submit(request({ category: 'missing', page: '', description: 'Die Vorschrift zum Testthema fehlt in West.' }));
    expect(result.receipt).toBeTruthy(); expect((await getFeedback(db, result.receipt!))?.context_path).toBeNull();
  });
});

describe('sichere anonyme Übermittlung', () => {
  it('speichert genau den bereinigten Normkontext, bestätigt nur eine zufällige Vorgangsnummer', async () => {
    const result = await submit();
    expect(result.status).toBe(200); expect(result.receipt).toMatch(/^[a-f\d-]{36}$/u); expect(result.fields.description).toBe('');
    const row = await getFeedback(db, result.receipt!);
    expect(row).toMatchObject({ version_id: '2026-05-01', norm_slug: 'hinweis-west', status: 'new', editorial_note: '', contact_email: null });
    expect(row?.context_path).not.toContain('?');
    expect(JSON.stringify(row)).not.toContain('192.0.2.10');
    expect(limiter.limit.mock.calls[0]![0].key).toMatch(/^feedback:[A-Za-z0-9_-]{43}$/u);
    const sent = siteverify.mock.calls[0]!;
    expect(sent[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(sent[1]?.body)).not.toContain('remoteip');
  });
  it('behält historische Fassungen auch beim Speichern bei und entfernt mark/textmark', async () => {
    const result = await submit(request({ page: `${origin}/west/norm/hinweis-west/version/2023-12-01/paragraph-1/?mark=1&textmark=private` }));
    expect(await getFeedback(db, result.receipt!)).toMatchObject({ version_id: '2023-12-01', provision_anchor: 'paragraph-1', context_path: '/west/norm/hinweis-west/version/2023-12-01/paragraph-1/' });
  });
  it('behandelt XSS und SQL-Befehle ausschließlich als Text', async () => {
    const description = '<script>alert("xss")</script>\n\'); DROP TABLE feedback_reports; --';
    const result = await submit(request({ description }));
    expect((await getFeedback(db, result.receipt!))?.description).toBe(description); expect(count()).toBe(1);
  });
  it.each([{ category: '__proto__' }, { description: 'zu kurz' }, { description: 'x'.repeat(5001) }, { email: 'a'.repeat(255) }, { email: '<script>@evil.org' }, { page: 'https://evil.example/' }, { page: 'x'.repeat(1025) }])('validiert Felder serverseitig: %j', async values => { const result = await submit(request(values)); expect(result.status).toBe(422); expect(result.receipt).toBeUndefined(); expect(count()).toBe(0); });
  it('akzeptiert die Zeichengrenze auch mit mehrbytigem Unicode innerhalb des Bodylimits', async () => {
    expect((await submit(request({ description: '字'.repeat(5000) }))).status).toBe(200);
  });
  it('meldet den Ausfall der Normkontextauflösung als Betriebsfehler, nicht als ungültige Adresse', async () => {
    const result = await submitFeedback(request(), env(), { context: async () => { throw new Error('interne D1-Diagnose'); }, fetch: siteverify, now: () => now });
    expect(result.status).toBe(503); expect(result.receipt).toBeUndefined(); expect(JSON.stringify(result)).not.toContain('Diagnose');
  });
  it('weist übergroße und doppelte Formulardaten zurück, auch ohne Content-Length', async () => {
    const big = new Request(`${origin}/fehler-melden/`, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '192.0.2.10' }, body: 'description=' + 'x'.repeat(FEEDBACK_LIMITS.body) });
    expect((await submit(big)).status).toBe(413);
    const duplicate = request(); const body = await duplicate.text();
    expect((await submit(new Request(duplicate.url, { method: 'POST', headers: duplicate.headers, body: body + '&category=other' }))).status).toBe(400);
    expect(count()).toBe(0);
  });
  it.each([{ origin: 'https://evil.example' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }])('lehnt fremde Herkunft ab: %j', async headers => { expect((await submit(request({}, headers))).status).toBe(403); expect(siteverify).not.toHaveBeenCalled(); });
  it('verwirft ungültige UTF-8-Bytes als Eingabefehler', async () => {
    const base = request();
    const malformed = new Request(base.url, { method: 'POST', headers: base.headers, body: new Uint8Array([255]) });
    expect((await submit(malformed)).status).toBe(400); expect(count()).toBe(0);
  });
  it('lehnt falschen Content-Type und Honeypot ab, ohne Erfolg zu suggerieren', async () => {
    expect((await submit(request({}, { 'content-type': 'application/json' }))).status).toBe(415);
    const result = await submit(request({ website: 'spam' })); expect(result.status).toBe(400); expect(result.receipt).toBeUndefined(); expect(count()).toBe(0);
  });
  it.each(['', 'ungueltig', 'x.y'])('weist ungültigen CSRF-Nachweis ab: %s', async csrf => { expect((await submit(request({ csrf }))).status).toBe(403); expect(count()).toBe(0); });
  it('bindet Tickets an Sitzung und Ablauf, toleriert keine Cookie-Duplikate', async () => {
    expect(await verifyFeedbackTicket(csrfSecret, ticket.token, 'fremde-sitzung', now)).toBeNull();
    expect(await verifyFeedbackTicket(csrfSecret, ticket.token, ticket.session, now + FEEDBACK_TTL_SECONDS * 1000 + 1)).toBeNull();
    expect(feedbackSession(`${FEEDBACK_COOKIE}=${ticket.session}; ${FEEDBACK_COOKIE}=${ticket.session}`)).toBeNull();
    expect((await submit(request({}, { cookie: '' }))).status).toBe(403);
  });
  it.each([{ success: false }, { success: true, hostname: 'evil.example', action: 'feedback' }, { success: true, hostname: 'landesrecht.example', action: 'login' }])('prüft Turnstile serverseitig: %j', async response => { siteverify.mockResolvedValue(Response.json(response)); expect((await submit()).status).toBe(403); expect(count()).toBe(0); });
  it('behandelt Turnstile-Ausfall fail-closed', async () => { siteverify.mockRejectedValue(new Error('interne Diagnose SECRET')); const result = await submit(); expect(result.status).toBe(503); expect(JSON.stringify(result)).not.toContain('SECRET'); expect(count()).toBe(0); });
  it('weist Rate-Limits und Drosselausfälle zurück, ohne externe Prüfung/Schreibzugriff', async () => {
    limiter.limit.mockResolvedValue({ success: false }); expect((await submit()).status).toBe(429); expect(siteverify).not.toHaveBeenCalled();
    limiter.limit.mockRejectedValue(new Error('limiter down')); expect((await submit()).status).toBe(503); expect(count()).toBe(0);
  });
  it('zeigt bei Datenbankausfall keinen Erfolg und keine internen Details', async () => {
    const bad = { ...env(), LANDESRECHT_FEEDBACK: { prepare() { throw new Error('D1 SECRET Infrastruktur'); } } };
    const result = await submit(request(), bad); expect(result.status).toBe(503); expect(result.receipt).toBeUndefined(); expect(JSON.stringify(result)).not.toMatch(/D1|SECRET|Infrastruktur/u);
  });
  it('verhindert doppelte Übermittlung einschließlich paralleler Wiederholung', async () => {
    const [a, b] = await Promise.all([submit(), submit()]); expect(a.receipt).toBe(b.receipt); expect(count()).toBe(1);
    siteverify.mockRejectedValue(new Error('Token bereits verbraucht'));
    const again = await submit(); expect(again.receipt).toBe(a.receipt);
    const conflict = await submit(request({ description: 'Andere Meldung mit demselben Formular.' })); expect(conflict.status).toBe(409); expect(conflict.receipt).toBeUndefined();
  });
  it('gibt keine fremden Meldungsdaten aus, auch bei Konflikten', async () => {
    await submit(request({ email: 'privat@example.org' }));
    const conflict = await submit(); expect(conflict.status).toBe(409); expect(JSON.stringify(conflict)).not.toContain('privat@example.org');
  });
  it('bleibt ohne Feature-/Datenschutzfreigabe oder vollständige Konfiguration deaktiviert', async () => {
    for (const key of ['FEEDBACK_ENABLED', 'FEEDBACK_PRIVACY_APPROVED', 'FEEDBACK_ORIGIN', 'LANDESRECHT_FEEDBACK', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'FEEDBACK_CSRF_SECRET', 'FEEDBACK_RATE_SECRET', 'FEEDBACK_RATE_LIMITER']) {
      const incomplete = { ...env(), [key]: undefined }; expect(feedbackConfig(incomplete), key).toBeNull(); expect((await submit(request(), incomplete)).status).toBe(503);
    }
    expect(feedbackConfig({ ...env(), FEEDBACK_ENABLED: 'false' })).toBeNull();
    expect(feedbackConfig({ ...env(), TURNSTILE_SITE_KEY: '1x' + '0'.repeat(20) + 'AA' })).toBeNull();
    expect(feedbackConfig({ ...env(), TURNSTILE_SECRET_KEY: '1x' + '0'.repeat(20) + 'AA' })).toBeNull();
    expect(feedbackConfig({ ...env(), LANDESRECHT_WEST: db })).toBeNull(); expect(count()).toBe(0);
  });
});

describe('isolierte redaktionelle Bearbeitung', () => {
  it('prüft Datenbanksignatur und verbietet eine Datenbank mit Normtabellen', async () => {
    await assertFeedbackDatabase(db); db.native.exec('CREATE TABLE law_norms (id TEXT)');
    await expect(assertFeedbackDatabase(db)).rejects.toThrow(); expect((await submit()).status).toBe(503);
  });
  it('validiert Filter, priorisiert sicher und sperrt verlorene Änderungen', async () => {
    const result = await submit(); const id = result.receipt!;
    await expect(listFeedback(db, { status: "new' OR 1=1 --" as 'new' })).rejects.toThrow();
    await expect(getFeedback(db, "' OR 1=1 --")).rejects.toThrow();
    await updateFeedback(db, { id, revision: 0, status: 'triaged', priority: 'P0', note: '<script>kein HTML</script>', now: new Date(now).toISOString() });
    expect((await listFeedback(db, { status: 'triaged', priority: 'P0' }))[0]).toMatchObject({ id, revision: 1, editorial_note: '<script>kein HTML</script>' });
    await expect(updateFeedback(db, { id, revision: 0, status: 'in-progress', priority: 'P0', note: '', now: new Date(now).toISOString() })).rejects.toThrow();
    await expect(deleteFeedback(db, id, 0)).rejects.toThrow(); await deleteFeedback(db, id, 1); expect(count()).toBe(0);
  });
  it('erzwingt Sichtung vor Bearbeitung und erlaubt explizites Wiederöffnen', async () => {
    const id = (await submit()).receipt!;
    await expect(updateFeedback(db, { id, revision: 0, status: 'resolved', priority: 'P2', note: '', now: new Date(now).toISOString() })).rejects.toThrow();
    await updateFeedback(db, { id, revision: 0, status: 'triaged', priority: 'P2', note: '', now: new Date(now).toISOString() });
    await updateFeedback(db, { id, revision: 1, status: 'resolved', priority: 'P2', note: 'Nach bestehendem Prüfverfahren entschieden.', now: new Date(now).toISOString() });
    await updateFeedback(db, { id, revision: 2, status: 'triaged', priority: 'P1', note: 'Erneute Sichtung.', now: new Date(now).toISOString() });
    expect((await getFeedback(db, id))?.revision).toBe(3);
  });
});

it('lockert ausschließlich die explizite Feedback-CSP um Turnstile, ohne unsafe-inline-Skripte', () => {
  const regular = secureResponse(new Response('normal'));
  expect(regular.headers.get('content-security-policy')).toBe(SECURITY_HEADERS['Content-Security-Policy']);
  const feedback = secureResponse(new Response('Formular', { headers: { 'Content-Security-Policy': FEEDBACK_CSP, 'Cache-Control': 'no-store' } }));
  expect(feedback.headers.get('content-security-policy')).toContain('frame-src https://challenges.cloudflare.com');
  expect(feedback.headers.get('content-security-policy')).not.toContain("script-src 'unsafe-inline'");
  expect(feedback.headers.get('cache-control')).toBe('no-store');
});
