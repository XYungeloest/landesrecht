import { assertFeedbackDatabase, existingFeedback, insertFeedback, validateFeedback, FEEDBACK_LIMITS, type FeedbackContext, type FeedbackErrors, type FeedbackFields } from '@landesrecht/runtime/feedback.ts';
import { FeedbackContextError } from './context.ts';
import { feedbackConfig, feedbackHmac, feedbackSession, verifyFeedbackTicket, verifyTurnstile } from './security.ts';

export interface FeedbackResult { status: number; errors: FeedbackErrors; fields: FeedbackFields; receipt?: string; retryToken?: string }
const empty = (): FeedbackFields => ({ category: '', description: '', email: '', page: '' });
const allowed = new Set(['category', 'description', 'email', 'page', 'csrf', 'website', 'cf-turnstile-response']);
class RequestProblem extends Error { status: number; constructor(status: number) { super('Ungültige Anfrage'); this.status = status; } }
async function readForm(request: Request): Promise<URLSearchParams> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/u.test(length) || Number(length) > FEEDBACK_LIMITS.body)) throw new RequestProblem(413);
  if (!request.body) throw new RequestProblem(400);
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > FEEDBACK_LIMITS.body) throw new RequestProblem(413); chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new RequestProblem(400); }
    };
    const params = await Promise.race([read(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new RequestProblem(408)), 8000); })]);
    for (const name of params.keys()) if (!allowed.has(name) || params.getAll(name).length !== 1) throw new RequestProblem(400);
    return params;
  } finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export async function submitFeedback(request: Request, env: Record<string, unknown> | null, dependencies: { context: (path: string, origin: string) => Promise<FeedbackContext | null>; fetch?: typeof fetch; now?: () => number }): Promise<FeedbackResult> {
  const fields = empty(); let retryToken: string | undefined;
  const fail = (status: number, message: string, errors: FeedbackErrors = {}): FeedbackResult => ({ status, errors: { form: message, ...errors }, fields, retryToken });
  const config = feedbackConfig(env);
  if (!config) return fail(503, 'Meldungen können momentan nicht übermittelt werden. Bitte versuchen Sie es später erneut.');
  const now = dependencies.now?.() ?? Date.now();
  try {
    if (request.method !== 'POST') return fail(405, 'Diese Anfrage ist nicht zulässig.');
    if (new URL(request.url).origin !== config.origin || request.headers.get('origin') !== config.origin || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) return fail(403, 'Die Anfrage konnte nicht geprüft werden. Bitte öffnen Sie das Formular erneut.');
    if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) return fail(415, 'Das Formular konnte nicht gelesen werden. Bitte verwenden Sie die Meldeseite.');
    // IP nur vorübergehend für einen täglich wechselnden HMAC-Drosselschlüssel; nie im Feedback speichern.
    const address = request.headers.get('cf-connecting-ip');
    if (!address || address.length > 64 || !/^[a-fA-F0-9:.]+$/u.test(address)) return fail(503, 'Die Übermittlung ist momentan nicht verfügbar.');
    const rateKey = await feedbackHmac(config.rateSecret, `${Math.floor(now / 86400000)}:${address}`);
    let rateTimer: ReturnType<typeof setTimeout> | undefined;
    let rate: { success: boolean };
    try {
      rate = await Promise.race([config.limiter.limit({ key: `feedback:${rateKey}` }), new Promise<never>((_resolve, reject) => { rateTimer = setTimeout(() => reject(new Error('Drosselung nicht verfügbar')), 3000); })]);
    } finally { if (rateTimer) clearTimeout(rateTimer); }
    if (rate.success !== true) return fail(429, 'Es wurden zu viele Meldungen versucht. Bitte warten Sie mindestens eine Minute und versuchen Sie es erneut.');
    const params = await readForm(request);
    fields.category = (params.get('category') ?? '').trim().slice(0, 100);
    fields.description = (params.get('description') ?? '').trim();
    fields.email = (params.get('email') ?? '').trim();
    fields.page = (params.get('page') ?? '').trim();
    const token = params.get('csrf') ?? '';
    const submissionId = await verifyFeedbackTicket(config.csrfSecret, token, feedbackSession(request.headers.get('cookie')), now);
    if (!submissionId) return fail(403, 'Das Formular ist abgelaufen oder konnte nicht geprüft werden. Bitte laden Sie es neu.');
    retryToken = token;
    if (params.get('website')) return fail(400, 'Die Meldung konnte nicht geprüft werden. Bitte laden Sie das Formular neu.');
    const errors = validateFeedback(fields);
    if (Object.keys(errors).length) return fail(422, 'Bitte korrigieren Sie die markierten Felder.', errors);
    let context: FeedbackContext | null;
    try { context = await dependencies.context(fields.page, config.origin); }
    catch (error) {
      if (!(error instanceof FeedbackContextError)) throw error;
      return fail(422, 'Bitte prüfen Sie die betroffene Seite.', { page: 'Bitte verwenden Sie eine bekannte interne Landesrecht-Seite oder lassen Sie das Feld leer.' });
    }
    fields.page = context?.path ?? '';
    await assertFeedbackDatabase(config.db);
    const hash = await feedbackHmac(config.csrfSecret, JSON.stringify({ ...fields, context }));
    const receipt = (stored: { id: string; request_hash: string }): FeedbackResult => stored.request_hash === hash
      ? { status: 200, errors: {}, fields: empty(), receipt: stored.id }
      : fail(409, 'Dieses Formular wurde bereits für eine andere Meldung verwendet. Bitte öffnen Sie ein neues Formular.');
    const previous = await existingFeedback(config.db, submissionId);
    if (previous) return receipt(previous);
    if (!await verifyTurnstile(config, params.get('cf-turnstile-response') ?? '', dependencies.fetch)) return fail(403, 'Die Sicherheitsprüfung ist fehlgeschlagen oder abgelaufen. Bitte führen Sie sie erneut aus.');
    const stored = await insertFeedback(config.db, { submissionId, hash, fields, context, now: new Date(now).toISOString() });
    return receipt(stored);
  } catch (error) {
    if (error instanceof RequestProblem) return fail(error.status, error.status === 413 ? 'Die Meldung ist zu groß. Bitte kürzen Sie Ihre Angaben.' : 'Das Formular konnte nicht vollständig gelesen werden. Bitte versuchen Sie es erneut.');
    // Keine Eingaben, E-Mail, Adresse, Tokens oder Datenbankdiagnosen protokollieren oder zurückgeben.
    return fail(503, 'Die Meldung konnte nicht bestätigt werden. Bitte versuchen Sie die Übermittlung erneut.');
  }
}
