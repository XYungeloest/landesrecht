/** Gemeinsame Header für Worker-Antworten; statische Assets spiegeln sie in public/_headers. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
} as const;

/** Ausschließlich die aktive Meldeseite erlaubt Turnstile-Skript und -Frame. */
export const FEEDBACK_CSP = SECURITY_HEADERS['Content-Security-Policy']
  .replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com")
  + '; frame-src https://challenges.cloudflare.com';

export function secureResponse(response: Response, development = false): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // Vite benötigt im Entwicklungsbetrieb eigene Skripte und WebSocket-Verbindungen.
    if (development && name === 'Content-Security-Policy') continue;
    headers.set(name, name === 'Content-Security-Policy' && response.headers.get(name) === FEEDBACK_CSP ? FEEDBACK_CSP : value);
  }
  if (response.status >= 500) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
