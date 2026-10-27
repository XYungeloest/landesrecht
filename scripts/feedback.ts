#!/usr/bin/env node
/** Geschützte Feedback-CLI: lokal oder autorisierte, fest begrenzte Feedback-D1. Nie Normzugriff. */
import { chmod, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { assertFeedbackDatabase, getFeedback, listFeedback, updateFeedback, deleteFeedback, FEEDBACK_STATUSES, FEEDBACK_PRIORITIES, type FeedbackStatus, type FeedbackPriority } from '@landesrecht/runtime/feedback.ts';
import { FEEDBACK_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { createRemoteFeedbackDatabase, type FeedbackRemoteTarget } from './lib/feedback-admin.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

const args = process.argv.slice(2);
const command = args.shift();
const commands = ['init', 'list', 'show', 'export', 'update', 'delete'];
const options = new Map<string, string>();
const flags = new Set<string>();
const allowedOptions = new Set(['db', 'id', 'status', 'priority', 'revision', 'note-file', 'limit', 'offset', 'target', 'confirm-database']);
const allowedFlags = new Set(['write', 'include-contact', 'include-notes']);
try {
  if (!command || !commands.includes(command)) throw new Error('Aufruf: npm run feedback -- <init|list|show|export|update|delete> --db <separate.sqlite> oder --target staging|production [Optionen]. Schreibbefehle benötigen --write.');
  while (args.length) {
    const name = args.shift()!;
    if (!name.startsWith('--')) throw new Error('Unbekannte Option');
    const key = name.slice(2);
    if (options.has(key) || flags.has(key)) throw new Error('Doppelte Option');
    if (allowedFlags.has(key)) flags.add(key);
    else if (allowedOptions.has(key) && args[0] && !args[0].startsWith('--')) options.set(key, args.shift()!);
    else throw new Error('Unbekannte oder unvollständige Option; nur bekannte Optionen und fest konfigurierte Feedback-Ziele sind erlaubt');
  }
  const target = options.get('target') ?? 'local';
  if (!['local', 'staging', 'production'].includes(target)) throw new Error('--target local|staging|production');
  const path = options.get('db');
  if (target === 'local' && (!path || !path.endsWith('.sqlite'))) throw new Error('--db muss eine separate lokale .sqlite-Datei benennen');
  if (target !== 'local' && (path || command === 'init')) throw new Error('Remote nur vorhandene, getrennt konfigurierte Feedback-D1; keine Initialisierung');
  const write = ['init', 'update', 'delete'].includes(command);
  if (write && !flags.has('write')) throw new Error('Dieser Befehl benötigt --write');
  if (target !== 'local' && write && options.get('confirm-database') !== FEEDBACK_DATABASE_NAMES[target as FeedbackRemoteTarget]) throw new Error('Remote-Schreiben benötigt --confirm-database mit dem exakten Feedback-Datenbanknamen');
  const local = target === 'local' ? await openSqliteD1(resolve(path!), { readOnly: !write }) : null;
  const db = local ?? createRemoteFeedbackDatabase(resolveRepositoryRoot(), target as FeedbackRemoteTarget, write);
  try {
    if (command === 'init') {
      const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (tables.results.length) throw new Error('Initialisierung nur in einer leeren separaten Datenbank erlaubt');
      local!.native.exec(await readFile(join(resolveRepositoryRoot(), 'data/feedback/0001_feedback.sql'), 'utf8'));
      await chmod(resolve(path!), 0o600);
    }
    await assertFeedbackDatabase(db);
    const status = options.get('status') as FeedbackStatus | undefined;
    const priority = options.get('priority') as FeedbackPriority | undefined;
    if (status && !Object.hasOwn(FEEDBACK_STATUSES, status)) throw new Error('Ungültiger Status');
    if (priority && !FEEDBACK_PRIORITIES.includes(priority)) throw new Error('Ungültige Priorität');
    const id = options.get('id') ?? '';
    const emit = (row: Awaited<ReturnType<typeof getFeedback>>) => {
      if (!row) throw new Error('Vorgang nicht gefunden');
      // JSON statt Terminal-/HTML-/CSV-Auswertung; E-Mail und interne Notiz nur ausdrücklich exportieren.
      const { contact_email, editorial_note, ...rest } = row;
      process.stdout.write(JSON.stringify({ ...rest, ...(flags.has('include-contact') ? { contact_email } : {}), ...(flags.has('include-notes') ? { editorial_note } : {}) }) + '\n');
    };
    if (command === 'show') emit(await getFeedback(db, id));
    else if (command === 'list' || command === 'export') {
      const limit = Number(options.get('limit') ?? (command === 'export' ? 1000 : 100));
      const start = Number(options.get('offset') ?? 0);
      let offset = start;
      for (;;) {
        const rows = await listFeedback(db, { status, priority, limit, offset });
        for (const row of rows) emit(row);
        if (command === 'list' || rows.length < limit) break;
        offset += limit;
      }
    } else if (command === 'update' || command === 'delete') {
      if (!options.has('revision')) throw new Error('--revision aus der letzten Sichtung ist erforderlich');
      const revision = Number(options.get('revision'));
      if (command === 'delete') await deleteFeedback(db, id, revision);
      else {
        const current = await getFeedback(db, id);
        if (!current) throw new Error('Vorgang nicht gefunden');
        const note = options.has('note-file') ? await readFile(resolve(options.get('note-file')!), 'utf8') : current.editorial_note;
        await updateFeedback(db, { id, revision, status: status ?? current.status, priority: priority ?? current.priority, note, now: new Date().toISOString() });
      }
      process.stdout.write('Bearbeitung ausgeführt.\n');
    } else process.stdout.write('Separate lokale Feedback-Datenbank initialisiert.\n');
  } finally { local?.close(); }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Feedback-Befehl fehlgeschlagen'}\n`);
  process.exitCode = 1;
}
