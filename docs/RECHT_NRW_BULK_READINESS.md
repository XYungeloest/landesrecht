# RECHT.NRW-Bulkimport: Bereitschaft, Policies, GO/No-Go

Dieses Dokument ist die verbindliche Grundlage für den Auftrag:

> Führe den vollständigen Ausgangsimport des am 1. Dezember 2023 geltenden Landesrechts
> Nordrhein-Westfalens als Recht des Landes Westdeutschland aus.

| Parameter | Wert |
| --- | --- |
| Stichtag | `2023-12-01` (`SIMULATION_BASELINE_DATE`) |
| Quelle | Nordrhein-Westfalen, RECHT.NRW: LRGV (Gesetze, Rechtsverordnungen) und LRMB (Verwaltungsvorschriften, Ministerialblatt) |
| Ziel | Land Westdeutschland, ID `west`, Kurzname `West` |
| Umfang | `docs/LEGAL_SCOPE.md` |
| Technik | `docs/RECHT_NRW_BULK_IMPORT.md`, `docs/RECHT_NRW_IMPORT.md`, `docs/RECHT_NRW_LRMB_IMPORT.md` |

## Maschinelle Bereitschaftsprüfung

`npm run import:recht-nrw:readiness` meldet in der ersten Zeile `READY` oder `NOT READY` (Exit-Code 0 bzw. 1,
`--json` für Maschinen). Geprüft werden nur **systemische** Voraussetzungen:

| Prüfung | Bedingung |
| --- | --- |
| Enumeration LRGV und LRMB | vorhanden, Abgleich Sitemap ↔ Suchindex ok |
| Bulk-Komponenten und Befehle | alle Module und npm-Befehle vorhanden |
| Tests | JUnit-Ergebnis vorhanden, 0 Fehlschläge/übersprungen, jüngere als der Quellcode, Pflichtprüfungen enthalten (Enumeration, Resume, Budget, SIGINT, Cache, R2, Dokumentidentität, Landeshundegesetz, Undatierte, PDF, Coverage, Skalierung, Suchintegrität) |
| R2-Konfiguration | Bucket-Bindings, Variablen dokumentiert, Staging außerhalb von Git (Zugangsdaten nur Hinweis) |
| Review-Queue | Schema 2, je Quelle, keine Altdatei |
| Coverage | aktuell, Manifest ↔ Inhalte ↔ Slug-Registry konsistent, veraltete Importe nur Hinweis |
| D1-Skalierung | `data/audits/recht-nrw/d1-scale.json` grün (≥ 2 000 Normen, inkrementell äquivalent) |
| Dokumentidentität | synthetisches Materialiendokument → `mismatch` |
| VV-LHundG-Regression | echte Quelle → `consistent`, Import `imported-with-warnings`, rekonstruiert |
| Policies | dieses Dokument mit den Abschnitten unten |
| Fixtures | keine synthetischen Normen unter `content/` |

Normlokale Review-Fälle (Normativität, Institutionen, PDF, historische Lücken, Rekonstruktion) sind **keine**
Blocker: Der Bulk erfasst sie vollständig und weist sie in Coverage und Review-Queue aus.

## Fehlerklassen im Lauf

| Klasse | Beispiele | Verhalten |
| --- | --- | --- |
| normlokal, fachlich | Stichtagsfassung unklar, Dokumentidentität `review`/`mismatch`, PDF-only, fehlende Anlage, Normativität zweifelhaft, Geltung unbestimmt | `needs-review`, Review-Fall, Lauf geht weiter |
| normlokal, technisch | Parserausnahme bei einer Seite, nicht darstellbare Fassung | `failed` mit Fehlercode, Lauf geht weiter; später `--retry-failed` |
| systemisch | Sperrantworten (429/403 wiederholt), Budget erschöpft, R2-Konflikt oder -Ausfall, beschädigter Zustand, 20 Fehlschläge in Folge, derselbe Fehlercode in 15 von 25 Normen | kontrollierter Abbruch nach der laufenden Norm; betroffene Norm bleibt `pending`; Exit 2 (`aborted-systemic`) bzw. 0 (`budget-exhausted`) |
| Signal | SIGINT/SIGTERM | Ende nach der laufenden Norm (Exit 130), zweites Signal bricht den Abruf ab |

Institutionen ohne Zuordnung blockieren nicht (`imported-with-warnings`, `originEnactingBody` = Quelle,
`enactingBody` leer). Korrekter Text geht vor kosmetischer Umbenennung; es gibt keine pauschale
Ersetzung „NRW → West“.

## Undatierte LRMB-Altdatensätze

Befund: Ein großer Teil der LRMB-Verwaltungsvorschriften sind undatierte SMBl-Altdatensätze ohne „Gültig ab“ und
ohne Fassungsliste (Recherche September 2026: rund 3 960 von 4 750). Das Portal belegt für sie weder Beginn
noch Fortgeltung.

**Policy:** Ein undatierter Datensatz wird nur übernommen, wenn die Geltung am Stichtag belegt ist. Ohne Beleg
lautet das Ergebnis `undetermined` – Manifest und Review `historical-gap`, **keine** Übernahme, keine Schätzung.

Statuswerte (`validityProvenance`):

| Status | Bedeutung | Übernahme |
| --- | --- | --- |
| `exact` | Portalintervall ausdrücklich belegt | ja |
| `verified-active-at-baseline` | Beginn vor dem Stichtag belegt (Klausel oder eingearbeitete Änderung) **und** Fortgeltung über den Stichtag durch Kontinuitätsnachweis | ja |
| `reconstructed` | wie oben, Textstand am Stichtag über geprüftes Rezept hergeleitet | ja, nur mit Rezept |
| `undetermined` | ein Beleg fehlt oder widerspricht | nein (Review) |

Kontinuitätsnachweis – alle fünf Bedingungen (`lrmb/validity.ts`, `assessUndatedContinuity`):

1. **dieselbe Stammvorschrift:** Der Ministerialblatt-Eintrag der späteren Änderung nennt Titel,
   Ausfertigungsdatum und Stammfundstelle der Vorschrift;
2. **ausdrückliche Änderung:** Er enthält einen Änderungsbefehl für genau diese Vorschrift;
3. **lückenlose Kette:** Die Eingangsformel nennt die vorhergehende Änderung des Fundstellenverlaufs, ohne
   Aufhebung oder Neufassung dazwischen;
4. **konsistente Identität/Fundstelle:** Alle zugeordneten Änderungen nennen dieselbe Stammfundstelle;
5. **kein Gegenhinweis:** kein Aufhebungs-, Ablösungs- oder Neufassungshinweis in Änderungstexten und
   Portalvermerken.

Strategie zur Aufklärung des Altbestands (Reihenfolge der Belegquellen):

| Quelle | Belegstärke | Verwendung |
| --- | --- | --- |
| Ministerialblatt-Einträge der Änderungen (Befehl, Eingangsformel, Inkrafttreten) | `strong` | Kontinuität, Textstand, Inkrafttreten |
| Aufhebungs- und Ersetzungserlasse, Ersetzungsformeln („tritt außer Kraft“, „wird aufgehoben“, „ersetzt“), Nachfolgevorschriften | `strong` (widersprechend) | Widerlegung der Fortgeltung |
| Fundstellenverlauf / Änderungsvermerke der Seite | `strong` für die Kette, `supporting` für Vollständigkeit | Kette, Textstand |
| Geltungsklauseln im Text (Inkrafttreten, Befristung) | `strong` (Datum) / `supporting` (ohne Datum) | Beginn, Ende |
| SMBl-Gliederungsnummer, Register/Index des Ministerialblatts (Jahresausgaben) | `supporting` | Zuordnung, Querprüfung auf übersehene Änderungen |
| Suchindex `field_historically`, `field_outforce_date`, `field_effective_from` | `insufficient` | nur Hinweis und Priorisierung, nie allein entscheidend |

Nachträgliche Aufklärung einzelner Fälle: Beleg recherchieren → `data/imports/recht-nrw/overrides.json`
(`sourceValidFrom`/`sourceValidTo` mit Beleg, Prüfdatum, Prüfer) oder Rezept → Review-Fall mit
`npm run import:recht-nrw:review -- --decide <id> --status resolved --reason … --override <id> --write` →
`npm run import:recht-nrw:bulk -- --area lrmb --write --resume --retry-review --only term:<id>`.
KI-Einschätzungen sind nie Rechtsstand.

## PDF-only-Policy

| Fall | Erkennung | Behandlung |
| --- | --- | --- |
| 1. HTML-Text vollständig, PDF-Anlagen sind Muster, Vordrucke, Übersichten | kein Hinweis auf wesentlichen Anlageninhalt | Übernahme; PDFs archiviert und als Quelle registriert; Befund `annex-pdf-only` (Warnung) |
| 2. Kopf-/Bekanntgabeerlass, Regelungsgehalt im PDF mit Textebene | „… als Anlage beigefügt/bekannt gegeben“, „wird nicht abgedruckt“ + PDF-Anlagen; `inspectPdf` → `textLayer` | keine Übernahme; Review `attachment` (`attachment-pdf-only-essential`); Geltung wird trotzdem bestimmt, wenn die Normativität eindeutig ist; vorbereiteter Weg: strukturierte Transkription aus der Textebene |
| 3. Wie 2, aber Scan ohne Textebene | `inspectPdf` → `scanLike` | keine Übernahme; Review; **keine ungeprüfte OCR** |
| 4. Hauptdokument nur als PDF | kein HTML-Text | keine Übernahme; Review (`attachment-pdf-only-text`) |
| 5. Anlage fehlt, nicht abrufbar oder nicht unterstütztes Format | „nicht abgedruckt“ ohne verlinkte Anlage; 404/Netzfehler (negativ gecacht); DOCX, XLSX, ZIP u. a. | keine Übernahme bei fehlender oder nicht abrufbarer Anlage: Review (`attachment-missing-essential`, Vollständigkeit `essential-attachment-missing`; `attachment-fetch-failed`); nicht unterstütztes Format: Hinweis `attachment-unsupported-format` und Review; nie still unvollständig übernommen |
| 6. Staatsvertrag als PDF-Anlage eines Zustimmungsgesetzes | `lrgv/treaty.ts` (Titel + Zustimmungsformel) | Gesetz übernommen (Typ `zustimmungsgesetz`); Vertragstext als Anlage registriert; wesentlicher Text nur im PDF → Review `attachment` |

Prüffälle: **VV zur LHO** (Regelungsgehalt ausschließlich in 27 PDF-Anlagen) wird nie als vollständige Norm
übernommen; **VV TB NRW** (landesrechtliche Anpassungen in nicht abgedruckter Anlage) ist Review `attachment` mit
bestimmter Geltung.

Strukturierte Transkription (`data/imports/recht-nrw/transcriptions/term-<id>.json`,
`recht-nrw-transcription/1`): Ziel (Haupttext oder Anlage mit Bezeichnung), Primärquelle auf recht.nrw.de,
SHA-256 der PDF, Seitenbereich, Transkriptionsdatum, Prüfer und Prüfstatus, Integrität (Zeichenzahl, SHA-256 des
Blockbaums) und Normkörper im kanonischen Blockmodell. Verwendet wird sie nur mit Prüfstatus `verified`,
bestandener Integrität und passendem Quell-Hash; die Quellenreferenz lautet `structured-transcription`.
Übernommene Anlagen werden auf Aufnahme nach `docs/LEGAL_SCOPE.md` geprüft.

## Rekonstruktion, Institutionen, Staatsverträge

- **Rekonstruktionsqueue** (`npm run import:recht-nrw:reconstruction-queue -- --write`): alle Fälle
  `reconstruction-required` mit Priorisierungshilfe (Dokumenttyp, Gesetzesbezug, Sachgebiet, Quellenlage,
  geschätzter Aufwand) und Status `queued | recipe-draft | imported | blocked-uncertain`. Keine automatischen
  Rezepte, keine KI-Schätzung als Rechtsstand.
- **Institutionen** (`data/imports/recht-nrw/institution-mapping.json`): `preserve | safe-transform | map |
  review | historical-source-only`; Standard `review`, nicht blockierend, messbar in der Coverage. Gerichte
  werden nicht pauschal umbenannt.
- **Restformen:** nur sichere Regeln mit Regressionstests (Transformer 2.1.0); Fundstellenabkürzungen nie.
- **Staatsverträge:** Zustimmungsgesetz nur bei zwei Belegen als `zustimmungsgesetz`; LRGV-Bekanntmachungen
  über das Inkrafttreten werden als Beleg registriert (`data/imports/recht-nrw/evidence/lrgv/`).
- **Bundesrecht:** Verweise bleiben Text, Provider funktionsfähig, keine irreversible Rohlink-Bindung; kein
  Blocker.

## Nachweise

| Nachweis | Ort |
| --- | --- |
| Enumeration LRGV: 3 342 Einträge (Sitemap 10 518 Adressen / 3 338 Stämme, Suchindex 4 074; Abgleich ok) | `data/imports/recht-nrw/enumeration-lrgv.json` |
| Enumeration LRMB: 5 974 Einträge (Sitemap 6 532 / 5 971, Suchindex 6 351; Abgleich ok) | `data/imports/recht-nrw/enumeration-lrmb.json` |
| Echte Dry-runs `--limit 20` je Bereich ohne Fehler und ohne Sperrantworten | Laufausgabe; Befehl unten |
| Offline-Simulation mit 3 000 synthetischen Stammnormen: Abbruch, Resume, Speicher-R2, Slugkollisionen, Determinismus, D1 | `data/audits/recht-nrw/bulk-simulation.json` |
| D1-Skalierung mit 5 000 Normen: Voll- und inkrementelle Projektion äquivalent, Basisprüfung, Batches, Suche | `data/audits/recht-nrw/d1-scale.json` |
| Beispielkorpora 12 LRGV / 15 LRMB, alle Erwartungen erfüllt | `npm run import:recht-nrw:sample -- --area lrgv|lrmb --offline` |
| Coverage und Konsistenz | `data/audits/recht-nrw/coverage.json`, `COVERAGE.md` |

## GO/No-Go-Checkliste

GO nur, wenn **alle** Punkte erfüllt sind:

| # | Kriterium | Prüfung |
| --- | --- | --- |
| 1 | Arbeitsstand committet, Arbeitsbaum sauber | `git status` |
| 2 | Abhängigkeiten installiert | `npm ci` |
| 3 | Qualitätsgates grün | `npm run check`, `npm run test`, `npm run content:check`, `npm run d1:schema:check`, `npm run build` |
| 4 | Importaudit und Coverage ohne Abweichung | `npm run import:recht-nrw:audit`, `npm run import:recht-nrw:coverage` |
| 5 | Bereitschaftsprüfung | `npm run import:recht-nrw:readiness` → `READY` |
| 6 | Portal erreichbar, keine Sperrantworten | Dry-run `--limit 5` je Bereich zeigt `0 Sperrantworten` |
| 7 | Speicherplatz für Cache und Staging (Größenordnung 10–20 GB, v. a. LRMB-PDFs) | `df -h .` |
| 8 | Staging-Verzeichnis `.cache/recht-nrw-r2-staging/` wird bis zum R2-Sync gesichert und nicht gelöscht | organisatorisch |
| 9 | Kein Remote-Schreibzugriff geplant (R2-Upload, Remote-D1, Deployment nur mit gesonderter Freigabe) | organisatorisch |

**No-Go / Abbruch:** `NOT READY`; rote Tests; Enumerationsabgleich mit Abweichung; Sperrantworten im Dry-run;
im Lauf `aborted-systemic` oder `blocked` (Ursache klären, nicht blind wiederholen); R2-/Archivkonflikt
(abweichender Hash); beschädigter Zustand (`CorruptStateError`); massenhaft `document-identity-mismatch`
(Hinweis auf geänderte Portalstruktur).

## Befehle für den Bulk-Lauf

Reihenfolge für den nächsten Auftrag (alle Schreibläufe lokal; Rohquellen ins Staging, kein R2-Upload, keine
Remote-D1):

```sh
# 0. Vorbedingungen (GO/No-Go 1–5)
git status
npm ci
npm run check && npm run test && npm run content:check && npm run d1:schema:check && npm run build
npm run import:recht-nrw:audit
npm run import:recht-nrw:readiness                                   # muss READY melden

# 1. Enumeration auffrischen (je ≈ 60 Abrufe; Fortschritt bleibt erhalten)
npm run import:recht-nrw:enumerate -- --area lrgv --write
npm run import:recht-nrw:enumerate -- --area lrmb --write

# 2. Phase A – LRGV: Stichprobe, prüfen, dann vollständig
npm run import:recht-nrw:bulk -- --area lrgv --limit 5                # Dry-run: 0 Sperrantworten?
npm run import:recht-nrw:bulk -- --area lrgv --write --limit 50
npm run import:recht-nrw:audit && npm run content:check
npm run import:recht-nrw:bulk -- --area lrgv --write --resume         # wiederholen, bis runStatus „completed“
npm run import:recht-nrw:bulk -- --area lrgv --write --resume --retry-failed

# 3. Audit A
npm run import:recht-nrw:coverage -- --write
npm run import:recht-nrw:audit
npm run content:check && npm run d1:schema:check
npm run import:recht-nrw:search-audit

# 4. Phase B – LRMB: Stichprobe, prüfen, dann vollständig
npm run import:recht-nrw:bulk -- --area lrmb --limit 5
npm run import:recht-nrw:bulk -- --area lrmb --write --limit 50
npm run import:recht-nrw:audit && npm run content:check
npm run import:recht-nrw:bulk -- --area lrmb --write --resume         # wiederholen, bis runStatus „completed“
npm run import:recht-nrw:bulk -- --area lrmb --write --resume --retry-failed

# 5. Audit B und Abschluss
npm run import:recht-nrw:reconstruction-queue -- --write
npm run import:recht-nrw:coverage -- --write
npm run import:recht-nrw:audit
npm run check && npm run test && npm run content:check && npm run d1:schema:check && npm run build
npm run import:recht-nrw:search-audit
npm run d1:plan -- --jurisdiction west
npm run d1:apply:batches -- --database landesrecht-west --local --execute
npm run d1:seed:dev                                                   # Sichtprüfung lokal (/west/, Suche)
```

Hinweise:

- Jeder Lauf endet spätestens nach 3 000 Netzabrufen oder 8 Stunden (`budget-exhausted`, kein Fehler); dann
  denselben Befehl mit `--resume` wiederholen. Größenordnung: LRGV ≈ 8 000–10 000 Abrufe, LRMB ≈ 15 000–25 000
  Abrufe bei 1,5 s Mindestabstand.
- Nach `interrupted` (Exit 130) oder `aborted-systemic` (Exit 2): Ursache im Laufbericht
  `data/audits/recht-nrw/runs/` prüfen, beheben, dann `--resume`; nur technisch fehlgeschlagene Normen mit
  `--retry-failed`.
- Logzeilen des Runners sind auditierbar (kein Token, keine Kopfzeilen): Kopf `Lauf <runId> · <bereich> · write|dry-run
  · ausgewählt n von m`, je Stammnorm `[i/n] <bereich> <schlüssel> start <titel>` und `[i/n] <bereich> <schlüssel>
  ergebnis <status> [<sourceIdentity>] [<slug>] [(Review: …)] [FEHLER <code> <meldung>] · <ms>` (bei Abbruch
  `abbruch <status> (<code>) · <ms>`), Abschluss `Lauf <runId> beendet: <status> · verarbeitet i/n · <s>`. Die
  Ausgabe gehört nach `.cache/` oder außerhalb des Repositorys (`*.log` ist ignoriert), nicht in Git.
- Commits je Phase (nach Audit A und Audit B) halten die Diffs prüfbar.
- Die Beispielkorpus-Normen (versionierte Rohquellen unter `sources/recht-nrw/`) verarbeitet der Bulk nicht; er
  übernimmt ihren Manifeststatus.
- Neuerzeugung nach Parser-/Transformerwechsel ohne Netz:
  `npm run import:recht-nrw:bulk -- --area <bereich> --regenerate-stale --offline --write --resume`.

Nicht Teil des Ausgangsimports, jeweils nur mit gesonderter Freigabe:

```sh
npm run import:recht-nrw:r2-sync                                      # Dry-run: gestagte Objekte
npm run import:recht-nrw:r2-sync -- --r2-transport wrangler --write --limit 25   # kontrollierter Uploadtest über die Wrangler-Anmeldung (Standardtransport)
npm run import:recht-nrw:r2-sync -- --r2-transport wrangler --write --concurrency 6   # vollständiger Sync über Wrangler-Prozesse (höchstens 8 Einträge gleichzeitig; Byte-Rücklesung je Objekt)
npm run import:recht-nrw:r2-sync -- --r2-transport wrangler-api --write --concurrency 32 --verify etag   # optional, nur lokal (best effort): R2-API direkt mit dem Token der Wrangler-Anmeldung; Listing-/Etag-Prüfung + 2 % Byte-Stichproben, ≈2 Objekte/s (Einordnung: docs/DEPLOYMENT.md)
npm run d1:apply:batches -- --database landesrecht-west --execute --confirm-remote landesrecht-west
```

Alle Optionen: `node scripts/import-recht-nrw.ts r2-sync --help` (bzw. `help <befehl>` für jeden Befehl).
