-- Ausschließlich eigene Feedback-D1, niemals data/d1/ oder ein Norm-/OstRecht-Binding.
CREATE TABLE feedback_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO feedback_meta VALUES ('application', 'landesrecht-feedback/1');
CREATE TABLE feedback_reports (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('wording','version','missing','attachment','search','interface','other')),
  context_path TEXT,
  jurisdiction TEXT,
  norm_slug TEXT,
  version_id TEXT,
  provision_anchor TEXT,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 5000),
  contact_email TEXT CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','in-progress','resolved','rejected')),
  priority TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0','P1','P2','P3')),
  editorial_note TEXT NOT NULL DEFAULT '' CHECK (length(editorial_note) <= 5000),
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE INDEX feedback_work_queue ON feedback_reports (status, priority, created_at, id);
