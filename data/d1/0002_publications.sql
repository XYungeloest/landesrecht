-- Verkündungsblatt-Ausgaben der Simulation (content/publications/<jurisdiction>/<slug>.json), projiziert
-- nach dem Muster von OstRecht (data/recht/d1/0002_runtime_projection.sql, law_publications).
--
-- Additiv zu 0001_landesrecht.sql: Bestehende Datenbanken (Schema 0001) erhalten die Tabelle mit
--   npx wrangler d1 execute landesrecht-<jur> --remote --config wrangler.jsonc --file ../../data/d1/0002_publications.sql --yes
-- (aus apps/web; docs/DEPLOYMENT.md). Normtabellen bleiben unberührt; die Projektion schreibt Verkündungen
-- erst, wenn ein Land welche führt – der Fingerabdruck eines Bestands ohne Verkündungen ändert sich nicht.
--
-- slug ist je Jurisdiktion eindeutig (kollidierende Nummern verschiedener Ausgaben sind verschiedene Slugs);
-- gazette ist das Blattkürzel wie gedruckt bzw. historisch, series_title der historische Blattname,
-- publication_json die vollständige Ausgabe (Einträge, Quellenbelege mit SHA-256; keine Bilddaten).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS law_publications (
  slug TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  publication_date TEXT NOT NULL,
  gazette TEXT NOT NULL,
  series_title TEXT,
  year INTEGER NOT NULL,
  issue TEXT NOT NULL,
  title TEXT NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 0,
  publication_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (jurisdiction, slug)
);

CREATE INDEX IF NOT EXISTS idx_law_publications_date ON law_publications(jurisdiction, publication_date DESC);
