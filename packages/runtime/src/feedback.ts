/** Feedback ist ein Hinweis, nie eine Rechtsquelle. Kein Zugriff auf den Normbestand. */
import type { D1Database } from './d1-types.ts';

export const FEEDBACK_CATEGORIES = {
  wording: 'Fehler im Wortlaut',
  version: 'Falsche oder fehlende Fassung',
  missing: 'Fehlende Vorschrift',
  attachment: 'Fehlende Anlage oder Fundstelle',
  search: 'Fehlerhafte Suche oder Verlinkung',
  interface: 'Darstellungs-/Bedienungsfehler',
  other: 'Sonstiges',
} as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export const FEEDBACK_STATUSES = { new: 'Neu', triaged: 'In Prüfung', 'in-progress': 'In Bearbeitung', resolved: 'Erledigt', rejected: 'Zurückgewiesen' } as const;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUSES;
export const FEEDBACK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type FeedbackPriority = typeof FEEDBACK_PRIORITIES[number];
export const FEEDBACK_LIMITS = { body: 65_536, description: 5000, email: 254, page: 1024, note: 5000 } as const;
export const FEEDBACK_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export interface FeedbackContext { path: string; jurisdiction: string | null; norm: string | null; version: string | null; provision: string | null }
export interface FeedbackFields { category: string; description: string; email: string; page: string }
export type FeedbackErrors = Partial<Record<keyof FeedbackFields | 'form', string>>;
export function validateFeedback(fields: FeedbackFields): FeedbackErrors {
  const errors: FeedbackErrors = {};
  if (!Object.hasOwn(FEEDBACK_CATEGORIES, fields.category)) errors.category = 'Bitte wählen Sie die Art des Fehlers aus.';
  if (fields.description.trim().length < 10 || fields.description.length > FEEDBACK_LIMITS.description) errors.description = 'Bitte beschreiben Sie den Fehler mit 10 bis 5.000 Zeichen.';
  if (fields.email && (fields.email.length > FEEDBACK_LIMITS.email || !/^[^\s@<>\u0000-\u001f]+@[^\s@<>\u0000-\u001f]+\.[^\s@<>\u0000-\u001f]+$/u.test(fields.email))) errors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse an oder lassen Sie das Feld leer.';
  if (fields.page.length > FEEDBACK_LIMITS.page) errors.page = 'Die Seitenadresse ist zu lang.';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(fields.description)) errors.description = 'Bitte entfernen Sie nicht druckbare Steuerzeichen aus der Beschreibung.';
  return errors;
}
export interface FeedbackRow {
  id: string; created_at: string; category: FeedbackCategory; context_path: string | null;
  jurisdiction: string | null; norm_slug: string | null; version_id: string | null; provision_anchor: string | null;
  description: string; contact_email: string | null; status: FeedbackStatus; priority: FeedbackPriority;
  editorial_note: string; updated_at: string; revision: number;
}
export const FEEDBACK_PUBLIC_COLUMNS = 'id, created_at, category, context_path, jurisdiction, norm_slug, version_id, provision_anchor, description, contact_email, status, priority, editorial_note, updated_at, revision';
export async function existingFeedback(db: D1Database, submissionId: string): Promise<{ id: string; request_hash: string } | null> {
  return db.prepare('SELECT id, request_hash FROM feedback_reports WHERE submission_id = ?').bind(submissionId).first();
}
export async function insertFeedback(db: D1Database, data: { submissionId: string; hash: string; fields: FeedbackFields; context: FeedbackContext | null; now: string }): Promise<{ id: string; request_hash: string }> {
  const id = crypto.randomUUID();
  const c = data.context;
  const result = await db.prepare(`INSERT INTO feedback_reports
    (id, submission_id, request_hash, created_at, category, context_path, jurisdiction, norm_slug, version_id, provision_anchor, description, contact_email, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submission_id) DO NOTHING`)
    .bind(id, data.submissionId, data.hash, data.now, data.fields.category, c?.path ?? null, c?.jurisdiction ?? null, c?.norm ?? null, c?.version ?? null, c?.provision ?? null, data.fields.description, data.fields.email || null, data.now).run();
  if (!result.success) throw new Error('Feedback konnte nicht gespeichert werden');
  const stored = await existingFeedback(db, data.submissionId);
  if (!stored) throw new Error('Feedback nicht bestätigt');
  return stored;
}
export async function listFeedback(db: D1Database, options: { status?: FeedbackStatus; priority?: FeedbackPriority; limit?: number; offset?: number } = {}): Promise<FeedbackRow[]> {
  const clauses: string[] = []; const params: unknown[] = [];
  if (options.status) { if (!Object.hasOwn(FEEDBACK_STATUSES, options.status)) throw new Error('Ungültiger Status'); clauses.push('status = ?'); params.push(options.status); }
  if (options.priority) { if (!FEEDBACK_PRIORITIES.includes(options.priority)) throw new Error('Ungültige Priorität'); clauses.push('priority = ?'); params.push(options.priority); }
  const limit = options.limit ?? 100, offset = options.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Ungültige Seitenauswahl');
  return (await db.prepare(`SELECT ${FEEDBACK_PUBLIC_COLUMNS} FROM feedback_reports ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY priority, created_at, id LIMIT ? OFFSET ?`).bind(...params, limit, offset).all<FeedbackRow>()).results;
}
export async function getFeedback(db: D1Database, id: string): Promise<FeedbackRow | null> {
  if (!FEEDBACK_UUID.test(id)) throw new Error('Ungültige Vorgangsnummer');
  return db.prepare(`SELECT ${FEEDBACK_PUBLIC_COLUMNS} FROM feedback_reports WHERE id = ?`).bind(id).first<FeedbackRow>();
}
const transitions: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  new: ['new', 'triaged', 'rejected'], triaged: ['triaged', 'in-progress', 'resolved', 'rejected'],
  'in-progress': ['in-progress', 'triaged', 'resolved', 'rejected'], resolved: ['resolved', 'triaged'], rejected: ['rejected', 'triaged'],
};
export async function updateFeedback(db: D1Database, input: { id: string; revision: number; status: FeedbackStatus; priority: FeedbackPriority; note: string; now: string }): Promise<void> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0 || !Object.hasOwn(FEEDBACK_STATUSES, input.status) || !FEEDBACK_PRIORITIES.includes(input.priority) || input.note.length > FEEDBACK_LIMITS.note) throw new Error('Ungültige Bearbeitungsdaten');
  const current = await getFeedback(db, input.id);
  if (!current || current.revision !== input.revision) throw new Error('Vorgang fehlt oder wurde inzwischen geändert');
  if (!transitions[current.status].includes(input.status)) throw new Error('Statuswechsel nicht erlaubt; zuerst In Prüfung wählen');
  const result = await db.prepare('UPDATE feedback_reports SET status = ?, priority = ?, editorial_note = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? RETURNING id')
    .bind(input.status, input.priority, input.note, input.now, input.id, input.revision).all<{ id: string }>();
  if (!result.success || result.results.length !== 1) throw new Error('Vorgang wurde inzwischen geändert');
}
export async function deleteFeedback(db: D1Database, id: string, revision: number): Promise<void> {
  if (!FEEDBACK_UUID.test(id) || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Ungültige Löschangaben');
  const result = await db.prepare('DELETE FROM feedback_reports WHERE id = ? AND revision = ? RETURNING id').bind(id, revision).all<{ id: string }>();
  if (!result.success || result.results.length !== 1) throw new Error('Vorgang fehlt oder wurde inzwischen geändert');
}

/** Verhindert auch bei versehentlich falsch verdrahtetem Binding Schreibzugriffe auf Rechtsdatenbanken. */
export async function assertFeedbackDatabase(db: D1Database): Promise<void> {
  const marker = await db.prepare("SELECT value FROM feedback_meta WHERE key = 'application'").first<{ value: string }>();
  const legal = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('law_norms','law_versions') LIMIT 1").first();
  if (marker?.value !== 'landesrecht-feedback/1' || legal) throw new Error('Keine isolierte Feedback-Datenbank');
}
