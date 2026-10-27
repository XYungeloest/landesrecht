import { FEEDBACK_D1_BINDING, FEEDBACK_RATE_LIMIT_BINDING, RUNTIME_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import type { D1Database } from '@landesrecht/runtime/d1-types.ts';
import { FEEDBACK_UUID } from '@landesrecht/runtime/feedback.ts';

export const FEEDBACK_COOKIE = '__Host-landesrecht-feedback';
export const FEEDBACK_TTL_SECONDS = 1800;
export interface FeedbackRateLimiter { limit(input: { key: string }): Promise<{ success: boolean }> }
export interface FeedbackConfig { db: D1Database; limiter: FeedbackRateLimiter; origin: string; sitekey: string; turnstileSecret: string; csrfSecret: string; rateSecret: string }
export function feedbackConfig(env: Record<string, unknown> | null): FeedbackConfig | null {
  if (!env || env.FEEDBACK_ENABLED !== 'true' || env.FEEDBACK_PRIVACY_APPROVED !== 'true') return null;
  const db = env[FEEDBACK_D1_BINDING] as D1Database | undefined;
  const limiter = env[FEEDBACK_RATE_LIMIT_BINDING] as FeedbackRateLimiter | undefined;
  if (!db || typeof db.prepare !== 'function' || !limiter || typeof limiter.limit !== 'function' || Object.values(RUNTIME_D1_BINDINGS).some(name => env[name] === db)) return null;
  const origin = env.FEEDBACK_ORIGIN;
  if (typeof origin !== 'string') return null;
  try { const url = new URL(origin); if (url.origin !== origin || url.protocol !== 'https:') return null; } catch { return null; }
  const sitekey = env.TURNSTILE_SITE_KEY, turnstileSecret = env.TURNSTILE_SECRET_KEY, csrfSecret = env.FEEDBACK_CSRF_SECRET, rateSecret = env.FEEDBACK_RATE_SECRET;
  if (typeof sitekey !== 'string' || !/^[a-zA-Z0-9_-]{10,100}$/u.test(sitekey) || typeof turnstileSecret !== 'string' || turnstileSecret.length < 20 || typeof csrfSecret !== 'string' || csrfSecret.length < 32 || typeof rateSecret !== 'string' || rateSecret.length < 32) return null;
  // Öffentliche Turnstile-Testschlüssel dürfen in Produktionskonfiguration nie aktiv werden.
  if (env.APP_ENV !== 'development' && (/^[123]x0{10}/u.test(sitekey) || /^[123]x0{10}/u.test(turnstileSecret))) return null;
  return { db, limiter, origin, sitekey, turnstileSecret, csrfSecret, rateSecret };
}
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
const unbase64 = (value: string): Uint8Array => Uint8Array.from(atob(value.replace(/-/gu, '+').replace(/_/gu, '/')), c => c.charCodeAt(0));
async function key(secret: string): Promise<CryptoKey> { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function feedbackHmac(secret: string, value: string): Promise<string> { return base64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value)))); }
export function feedbackSession(cookie: string | null): string | null {
  const values = (cookie ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${FEEDBACK_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0]!.slice(FEEDBACK_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
}
export async function issueFeedbackTicket(secret: string, session: string | null, now = Date.now()): Promise<{ token: string; session: string; cookie: string }> {
  session ??= base64(crypto.getRandomValues(new Uint8Array(32)));
  const payload = base64(encoder.encode(JSON.stringify({ id: crypto.randomUUID(), at: now, session })));
  const token = `${payload}.${await feedbackHmac(secret, payload)}`;
  return { token, session, cookie: `${FEEDBACK_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${FEEDBACK_TTL_SECONDS}` };
}
export async function verifyFeedbackTicket(secret: string, token: string, session: string | null, now = Date.now()): Promise<string | null> {
  try {
    if (!session || token.length > 600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    const [payload, signature] = token.split('.') as [string, string];
    if (!await crypto.subtle.verify('HMAC', await key(secret), unbase64(signature) as BufferSource, encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(unbase64(payload))) as { id: string; at: number; session: string };
    if (!FEEDBACK_UUID.test(data.id) || !Number.isFinite(data.at) || data.at > now || now - data.at > FEEDBACK_TTL_SECONDS * 1000 || data.session !== session) return null;
    return data.id;
  } catch { return null; }
}
export async function verifyTurnstile(config: FeedbackConfig, token: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  // IP-Adresse bewusst nicht an Siteverify weitergeben; kein Logging von Token oder Antwortinhalt.
  const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: config.turnstileSecret, response: token }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
  return result.success === true && result.hostname === new URL(config.origin).hostname && result.action === 'feedback';
}
