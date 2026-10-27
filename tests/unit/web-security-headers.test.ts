import { expect, it } from 'vitest';
import { secureResponse } from '../../apps/web/src/lib/security-headers.ts';

it('sichert auch Fehler und Redirects ab, behält Status, Inhalt und Location', async () => {
  const response = secureResponse(new Response('Fehler', { status: 500, headers: { 'Cache-Control': 'public, max-age=600' } }));
  expect(response.status).toBe(500);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Content-Security-Policy')).toContain("object-src 'none'");
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(await response.text()).toBe('Fehler');
  const redirect = secureResponse(Response.redirect('https://example.org/', 301));
  expect(redirect.status).toBe(301);
  expect(redirect.headers.get('Location')).toBe('https://example.org/');
});
