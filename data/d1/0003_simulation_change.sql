-- Abgeleitete Klassifikation gegenüber dem Ausgangsrechtsstand (packages/legal-core/src/lib/simulation-change.ts),
-- als Projektionsspalten für Filter und Sortierung der Oberfläche („In der Simulation geändert“, „Neu in der
-- Simulation“, jüngste Änderung zuerst). Additiv zu 0001/0002: keine Änderung an kanonischem Rechtsinhalt; die
-- Werte schreibt allein der Projektionsplan (Projektionsschema 2, Vollprojektion nach dieser Migration).
--
-- Bestehende Datenbanken erhalten die Spalten mit
--   npx wrangler d1 execute landesrecht-<jur> --remote --config wrangler.jsonc --file ../../data/d1/0003_simulation_change.sql --yes
-- (aus apps/web; docs/DEPLOYMENT.md). Danach Vollprojektion (`npm run d1:plan -- --jurisdiction <jur>`).

ALTER TABLE law_norms ADD COLUMN simulation_change_kind TEXT NOT NULL DEFAULT 'baseline-unchanged';
ALTER TABLE law_norms ADD COLUMN last_simulation_change_date TEXT;

CREATE INDEX IF NOT EXISTS idx_law_norms_simulation_change ON law_norms(jurisdiction, simulation_change_kind, last_simulation_change_date DESC);
