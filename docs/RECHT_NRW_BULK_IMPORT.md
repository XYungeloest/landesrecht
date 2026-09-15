# Plan: vollständiger LRGV-Ausgangsimport (RECHT.NRW → Land Westdeutschland)

Status: Plan, nicht ausgeführt. Voraussetzung ist der stabile Beispielkorpus aus
`docs/RECHT_NRW_IMPORT.md`. Ziel: alle am 2023-12-01 geltenden Gesetze und Rechtsverordnungen
des Landes Nordrhein-Westfalen als Ausgangsrecht des Landes Westdeutschland, je Stammnorm genau
eine Simulationsfassung `2023-12-01`.

## Enumeration aller Stammnormen

1. **Sitemaps** (`/sitemap.xml` → 36 Teilsitemaps, ≈ 36 000 Adressen) liefern jede Fassungsseite.
   Aus `/lrgv/gesetz/<TTMMJJJJ>-<slug>` und `/lrgv/rechtsverordnung/…` wird je Slug-Stamm die
   Fassungsfolge gebildet (Adresse ohne Datumspräfix als vorläufiger Gruppierungsschlüssel; Slug-
   Abweichungen zwischen Fassungen kommen vor, z. B. mit/ohne Abkürzungssuffix).
2. **OpenSearch-Middleware** (`POST https://recht.nrw.de/search-middleware/opensearch_internet/_search`,
   Index `opensearch_internet`, Filter `type: state_law_and_regulations`,
   `field_document_type_name: Gesetz|Rechtsverordnung`) liefert je Stammnorm die aktuellste
   Fassung mit `uuid`, `url`, Ausfertigungsdatum, `field_effective_from`, `field_inforce_date`,
   `field_outforce_date`, `field_historically`, PDF-URL. Paginierung über `from`/`size`
   (≤ 100 je Anfrage, kleine Seitengröße, Mindestabstand ≥ 1 s).
3. **Stammnorm-Identität**: Jede Fassungsseite nennt den Taxonomie-Term; Enumeration =
   Menge der Term-IDs. Die Sitemap-Gruppierung wird über den Term auf der zuerst abgerufenen
   Fassungsseite bestätigt; die Fassungsliste dieser Seite ersetzt die Sitemap-Gruppe.

## Filterung auf LRGV

Nur `lrgv/gesetz` und `lrgv/rechtsverordnung`. `lrgv/bekanntmachung` (1 235 Adressen) und alles
unter `lrmb/` (Verwaltungsvorschriften, Ministerialblatt) bleiben außen vor; ebenso
Stammnormen, deren letzte Fassung vor dem Stichtag endete (außer Kraft) oder deren erste Fassung
nach dem Stichtag beginnt.

## Ermittlung der Stichtagsfassung

Je Stammnorm: eine Fassungsseite abrufen → Fassungsliste → `selectSourceVersionAtBaseline` →
gewählte Seite abrufen → Infobox muss den Stichtag bestätigen. Erwartete Abrufe je Stammnorm:
2 Seiten + 1 Textdatei (Legacy) + Anlagen. Nicht darstellbare Stichtagsfassungen, Lücken und
Überlappungen wandern in die Reviewqueue (kein Raten).

## Deduplizierung

Schlüssel ist die Term-ID (`term:<id>`); das Manifest (`data/imports/recht-nrw/manifest.json`)
ist die Zustandsdatei. Erneute Läufe überspringen Einträge mit `importStatus: imported*` und
unverändertem `sha256` der Stichtagsseite (Etag-Ersatz), außer bei `--refresh`.

## Resume / Checkpoint

- Manifest wird nach jeder Stammnorm fortgeschrieben (atomar: Temp-Datei + Umbenennen).
- Enumerationsliste (`data/imports/recht-nrw/enumeration.json`: Term-ID, Einstiegs-URL,
  Dokumentart, Status `pending|done|failed|review`) wird vor dem Import erzeugt und ist der
  Fortsetzungspunkt (`--resume`).
- Abbruch (Ctrl-C, Netzfehler, Budget) hinterlässt nur vollständige Einträge; halbe Normen gibt es
  nicht, weil Content erst nach erfolgreicher Validierung geschrieben wird.

## Cache und Rate Limiting

Lokaler Rohquellen-Cache (`.cache/recht-nrw/`, SHA-256-geprüft) macht Wiederholungsläufe
netzfrei. Netzabrufe sequenziell, Mindestabstand 1–2 s, Timeout 20 s, Backoff bei 5xx/429, Abbruch
des Laufs nach n aufeinanderfolgenden `rate-limited`/`forbidden`-Antworten (Sperre respektieren,
später fortsetzen). Tageslimit konfigurierbar (z. B. 3 000 Abrufe). Größenordnung: ≈ 2 000–2 500
Stammnormen × ≈ 3 Abrufe ≈ 7 000 Abrufe ≈ 3–4 Stunden reine Wartezeit bei 1,5 s Abstand.

## Fehlerqueue und manuelle Reviewqueue

- **Fehlerqueue** (`failed`): technische Fehler (Netz, Timeout, Parserausnahme) – automatisch wiederholbar.
- **Reviewqueue** (`review`): fachliche Befunde – Stichtagsauswahl `gap|overlap|ambiguous|not-available|inconsistent-interval`, Integritätsabweichungen, unbekannte Strukturen, PDF-only-Anlagen, Slugkollisionen. Jeder Eintrag nennt Term, URL, Befund und die erwartete Entscheidung (z. B. `overrides.sourceValidTo` mit Begründung, wie bei KiBiz).
- Unresolved-Bezeichnungen (Regierungsbezirke, Landschaftsverbände, Kommunen, Ministerien) sind kein Importhindernis; sie werden gesammelt (`data/audits/recht-nrw/unresolved-summary.json`) und in einem eigenen redaktionellen Schritt entschieden.

## Deterministische Slugs und Kollisionen

Slug = transformierte Abkürzung (`vwvfg-west`), sonst Kurzbezeichnung, sonst Titel (an Wortgrenze
gekürzt); Suffix `-west`. Kollisionen (gleicher Slug, andere Term-ID) erhalten `-<termId>` und
einen Reviewhinweis. Slugs werden im Manifest festgeschrieben und bei Wiederholungsläufen
wiederverwendet.

## R2-Archivierung

Produktiv: Rohquellen nach `landesrecht-quellen` unter `west/recht-nrw/2023-12-01/<termId>/<sha256[0..16]>-<rolle>.<ext>`
(`sourceObjectKey`), Quellenreferenz `availability: r2-archived` mit `objectKey`, `sha256`, `url`,
`retrievedAt`. Upload prüft Rückleseidentität; ein Objekt mit abweichendem Hash wird nie
überschrieben. Für das Repository bleiben nur Manifest und Reports versioniert; die 2 MB des
Beispielkorpus unter `sources/recht-nrw/` sind eine bewusste Ausnahme.

## D1-Projektion

Nach dem Lauf: `npm run d1:seed:local` (Vollprojektion `landesrecht-west.sqlite`),
`npm run d1:schema:check`; remote `npm run d1:apply:remote` → `wrangler d1 execute landesrecht-west --remote --file …`
(manuell, nach Prüfung). Erwartete Größe: ≈ 2 500 Normen, ≈ 100 000 Sucheinheiten; Blöcke > 40 000
Zeichen werden geteilt. Inkrementelle Projektion aus `git diff` (OstRecht-Muster) wird nötig, sobald
der Bestand groß ist.

## Audit und Wiederholbarkeit

`npm run import:recht-nrw:audit` prüft Hashes, Dateien, Reports und Manifest. Ein Wiederholungslauf
mit gleichem Cache erzeugt byteidentische Content-Dateien (deterministische Slugs, feste
Feldreihenfolge, `importedAt` nur im Manifest). Änderungen am Parser (`PARSER_VERSION`) erfordern
einen Regenerationslauf mit Vergleich der Kennzahlen (Einheiten, Tabellen, Textumfang) je Norm.

## Abbruch und Fortsetzung

`--resume` liest die Enumerationsliste und das Manifest; `--only <termId>` und `--limit n` für
Teilmengen; Budgetgrenzen (Abrufe, Laufzeit) beenden den Lauf kontrolliert mit Statusausgabe.

## Umgang mit nicht darstellbaren historischen Fassungen

Ist die Stichtagsfassung „nicht darstellbar“, wird die Stammnorm in die Reviewqueue gestellt.
Optionen: PDF der Verkündung im GV. NRW. (`/gvnrw/<jahr>-…`), Rekonstruktion aus der nächsten
darstellbaren Fassung plus Änderungshistorie (nur mit dokumentierter Prüfung) oder vorläufiger
Ausschluss mit Vermerk in `CONTENT.md`/Reviewliste. Nie stillschweigend die nächste Fassung nehmen.

## Erwartbare Größenordnung

Sitemaps: 3 205 `lrgv/gesetz`- und 5 844 `lrgv/rechtsverordnung`-Fassungsseiten. Bei
durchschnittlich 3–4 Fassungen je Stammnorm ergeben sich ≈ 2 000–2 500 Stammnormen, davon ein
Teil am Stichtag außer Kraft. Rohquellen ≈ 100–300 MB (Legacy-Dateien bis 400 KB je Norm).
