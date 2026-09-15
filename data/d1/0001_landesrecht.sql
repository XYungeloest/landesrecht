-- Laufzeitprojektion des Landesrechtsportals (eine Datenbank je Jurisdiktion).
--
-- Git (content/norms/<jurisdiction>/…) bleibt fachlicher Source of Truth. Diese Tabellen werden
-- ausschließlich vom Projektionsplan (packages/runtime/src/projection.ts, scripts/project-d1.ts)
-- deterministisch befüllt. Sie enthalten keine Spalten für einzelne Herkunftssysteme:
-- externe Kennungen liegen generisch in law_external_identifiers, Quellen in law_source_objects.
--
-- Die Spalte jurisdiction ist redundant zur Datenbankzuordnung, damit dieselbe Projektion auch
-- in einer gemeinsamen Datenbank (lokale Fixture, Tests) korrekt bleibt und jede Zeile ihre
-- Rechtsordnung trägt.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS law_norms (
  id TEXT PRIMARY KEY,                     -- "<jurisdiction>:<slug>"
  jurisdiction TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  short_title TEXT NOT NULL,
  abbr TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  current_version_id TEXT NOT NULL,
  current_valid_from TEXT NOT NULL,
  document_date TEXT,
  publication_date TEXT,
  effective_date TEXT,
  expiry_date TEXT,
  initial_citation TEXT NOT NULL,
  summary TEXT,
  enacting_body TEXT,
  responsible_body TEXT,
  subjects_json TEXT NOT NULL DEFAULT '[]',
  primary_subject TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  external_ids_json TEXT NOT NULL DEFAULT '[]',
  sort_key TEXT NOT NULL,
  index_letter TEXT NOT NULL DEFAULT '#',
  version_count INTEGER NOT NULL DEFAULT 0,
  last_change_date TEXT,
  last_activity_date TEXT,
  meta_json TEXT NOT NULL,
  history_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (jurisdiction, slug)
);

CREATE INDEX IF NOT EXISTS idx_law_norms_type_sort ON law_norms(jurisdiction, type, sort_key);
CREATE INDEX IF NOT EXISTS idx_law_norms_status_sort ON law_norms(jurisdiction, status, sort_key);
CREATE INDEX IF NOT EXISTS idx_law_norms_letter ON law_norms(jurisdiction, index_letter, sort_key);
CREATE INDEX IF NOT EXISTS idx_law_norms_activity ON law_norms(jurisdiction, last_activity_date DESC);

-- Fassungen ohne Körper: das Simulationsintervall entscheidet über die Geltung, das
-- Quellintervall ist Provenienz der übernommenen realen Fassung.
CREATE TABLE IF NOT EXISTS law_versions (
  norm_id TEXT NOT NULL REFERENCES law_norms(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  simulation_valid_from TEXT NOT NULL,
  simulation_valid_to TEXT,
  source_valid_from TEXT,
  source_valid_to TEXT,
  temporal_kind TEXT NOT NULL CHECK (temporal_kind IN ('current', 'future', 'historical', 'unknown-effective')),
  title TEXT,
  short_title TEXT,
  abbr TEXT,
  citation TEXT NOT NULL,
  change_note TEXT NOT NULL,
  version_json TEXT NOT NULL,              -- Fassung ohne body
  search_document_json TEXT NOT NULL,      -- Suchdokument ohne units
  updated_at TEXT NOT NULL,
  PRIMARY KEY (norm_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_law_versions_validity ON law_versions(norm_id, simulation_valid_from, simulation_valid_to);
CREATE INDEX IF NOT EXISTS idx_law_versions_kind ON law_versions(temporal_kind, norm_id);

-- Der Normkörper wird blockweise gespeichert: jeder äußere Body-Block ist eine Zeile; sehr
-- große Blöcke werden in Teile zerlegt (part_index/part_count) und beim Lesen in Reihenfolge
-- wieder zusammengesetzt. So bleibt die Zeilengröße auch bei umfangreichen Anlagen beherrschbar.
CREATE TABLE IF NOT EXISTS law_version_blocks (
  norm_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  block_index INTEGER NOT NULL,
  part_index INTEGER NOT NULL DEFAULT 0,
  part_count INTEGER NOT NULL DEFAULT 1,
  block_json TEXT NOT NULL,
  PRIMARY KEY (norm_id, version_id, block_index, part_index),
  FOREIGN KEY (norm_id, version_id) REFERENCES law_versions(norm_id, version_id) ON DELETE CASCADE
);

-- Quellenobjekte: Brücke zum unveränderten R2-Archiv oder zur versionierten Repositorydatei.
-- version_id '' bezeichnet Quellen der Norm selbst (meta.json), sonst Quellen einer Fassung.
CREATE TABLE IF NOT EXISTS law_source_objects (
  norm_id TEXT NOT NULL REFERENCES law_norms(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL DEFAULT '',
  source_index INTEGER NOT NULL,
  kind TEXT NOT NULL,
  system TEXT,
  label TEXT NOT NULL,
  availability TEXT NOT NULL,
  url TEXT,
  local_source TEXT,
  object_key TEXT,
  media_type TEXT,
  sha256 TEXT,
  retrieved_at TEXT,
  external_id TEXT,
  source_valid_from TEXT,
  source_valid_to TEXT,
  source_role TEXT,
  PRIMARY KEY (norm_id, version_id, source_index)
);

CREATE TABLE IF NOT EXISTS law_norm_history (
  norm_id TEXT NOT NULL REFERENCES law_norms(id) ON DELETE CASCADE,
  entry_index INTEGER NOT NULL,
  change_date TEXT NOT NULL,
  change_type TEXT NOT NULL,
  title TEXT NOT NULL,
  citation TEXT NOT NULL,
  note TEXT,
  affecting_version_id TEXT,
  related_jurisdiction TEXT,
  related_slug TEXT,
  PRIMARY KEY (norm_id, entry_index)
);

CREATE INDEX IF NOT EXISTS idx_law_norm_history_date ON law_norm_history(change_type, change_date DESC);

CREATE TABLE IF NOT EXISTS law_norm_relations (
  norm_id TEXT NOT NULL REFERENCES law_norms(id) ON DELETE CASCADE,
  relation_index INTEGER NOT NULL,
  relation_type TEXT NOT NULL,
  target_jurisdiction TEXT NOT NULL,
  target_slug TEXT NOT NULL,
  note TEXT,
  relation_date TEXT,
  PRIMARY KEY (norm_id, relation_index)
);

CREATE INDEX IF NOT EXISTS idx_law_norm_relations_target ON law_norm_relations(target_jurisdiction, target_slug);

CREATE TABLE IF NOT EXISTS law_norm_subjects (
  norm_id TEXT NOT NULL REFERENCES law_norms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  subject_slug TEXT NOT NULL,
  PRIMARY KEY (norm_id, subject_slug)
);

CREATE INDEX IF NOT EXISTS idx_law_norm_subjects_subject ON law_norm_subjects(subject_slug, norm_id);

-- Generische externe Kennungen ({ system, value }) statt Einzelspalten je Herkunftssystem.
CREATE TABLE IF NOT EXISTS law_external_identifiers (
  norm_id TEXT NOT NULL REFERENCES law_norms(id) ON DELETE CASCADE,
  system TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT,
  PRIMARY KEY (norm_id, system, value)
);

CREATE INDEX IF NOT EXISTS idx_law_external_identifiers_lookup ON law_external_identifiers(system, value);

-- Sucheinheiten relational (indexierbare Löschung je Norm), Volltextindex mit externem Inhalt.
-- Spaltenreihenfolge ist Vertrag: packages/search/src/schema.ts.
CREATE TABLE IF NOT EXISTS law_search_units (
  id INTEGER PRIMARY KEY,
  norm_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  version_id TEXT NOT NULL,
  unit_index INTEGER NOT NULL,
  anchor TEXT NOT NULL,
  block_type TEXT NOT NULL,
  references_json TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  short_title TEXT NOT NULL,
  abbr TEXT NOT NULL,
  label TEXT NOT NULL,
  heading TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_law_search_units_norm ON law_search_units(norm_id);
CREATE INDEX IF NOT EXISTS idx_law_search_units_norm_version ON law_search_units(norm_id, version_id, unit_index);

CREATE VIRTUAL TABLE IF NOT EXISTS law_search USING fts5(
  norm_id UNINDEXED,
  jurisdiction UNINDEXED,
  version_id UNINDEXED,
  unit_index UNINDEXED,
  anchor UNINDEXED,
  block_type UNINDEXED,
  references_json UNINDEXED,
  slug UNINDEXED,
  title,
  short_title,
  abbr,
  label,
  heading,
  body,
  content='law_search_units',
  content_rowid='id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS law_search_units_ai AFTER INSERT ON law_search_units BEGIN
  INSERT INTO law_search(rowid, norm_id, jurisdiction, version_id, unit_index, anchor, block_type, references_json, slug, title, short_title, abbr, label, heading, body)
  VALUES (new.id, new.norm_id, new.jurisdiction, new.version_id, new.unit_index, new.anchor, new.block_type, new.references_json, new.slug, new.title, new.short_title, new.abbr, new.label, new.heading, new.body);
END;
CREATE TRIGGER IF NOT EXISTS law_search_units_ad AFTER DELETE ON law_search_units BEGIN
  INSERT INTO law_search(law_search, rowid, norm_id, jurisdiction, version_id, unit_index, anchor, block_type, references_json, slug, title, short_title, abbr, label, heading, body)
  VALUES ('delete', old.id, old.norm_id, old.jurisdiction, old.version_id, old.unit_index, old.anchor, old.block_type, old.references_json, old.slug, old.title, old.short_title, old.abbr, old.label, old.heading, old.body);
END;
CREATE TRIGGER IF NOT EXISTS law_search_units_au AFTER UPDATE ON law_search_units BEGIN
  INSERT INTO law_search(law_search, rowid, norm_id, jurisdiction, version_id, unit_index, anchor, block_type, references_json, slug, title, short_title, abbr, label, heading, body)
  VALUES ('delete', old.id, old.norm_id, old.jurisdiction, old.version_id, old.unit_index, old.anchor, old.block_type, old.references_json, old.slug, old.title, old.short_title, old.abbr, old.label, old.heading, old.body);
  INSERT INTO law_search(rowid, norm_id, jurisdiction, version_id, unit_index, anchor, block_type, references_json, slug, title, short_title, abbr, label, heading, body)
  VALUES (new.id, new.norm_id, new.jurisdiction, new.version_id, new.unit_index, new.anchor, new.block_type, new.references_json, new.slug, new.title, new.short_title, new.abbr, new.label, new.heading, new.body);
END;

-- Projektionsidentität und Bestandskennzahlen (Schlüssel: packages/runtime/src/projection.ts).
CREATE TABLE IF NOT EXISTS law_runtime_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
