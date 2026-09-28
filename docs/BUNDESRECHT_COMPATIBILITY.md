# Bundesrecht (gesetze-sim-internet.de): Kompatibilität und Anbindungsplan

Discovery-Stand 2026-09-29. **Noch keine Anbindung, kein Import, keine Runtime-Bindung.** Grundlage: das Schema
`imports/bund/schema.sql` und die Oberflächenstile `imports/bund/style.css` (lokal, gitignoriert, nie verändert; nicht
Teil des Sim-Quelleninventars). Heute bildet `packages/providers/src/federal.ts` nur Links
(`/gesetz.php?g=<abk>&p=…&abs=…`) und liefert keine Normdaten.

Lokal gesucht und **nicht gefunden**: Backend-Code des Bundesportals, Datenbank-Verbindungskonfiguration, API-
Beschreibung, Dump oder Exportmechanismus, Git-Repository (Projekte unter `~`, `~/Downloads`, `~/Documents`,
`~/Desktop`; keine Zugangsdaten gelesen oder ausgegeben). Es gibt daher keine verfügbare Runtime-Quelle; dieses
Dokument ist Mapping und Plan.

## 1 Schema (MySQL/InnoDB, utf8mb4)

| Tabelle | Zweck | Schlüssel, Indizes, Beziehungen |
| --- | --- | --- |
| `gesetze` | Stammdaten je Gesetz | PK `id`; UNIQUE `slug`, UNIQUE `abkuerzung`; `idx_status`, `idx_sortiername`; FULLTEXT `titel, kurztitel, abkuerzung` |
| `gliederung` | Gliederungsbaum (Buch … Titel) | PK `id`; FK `gesetz_id` → `gesetze` (CASCADE), FK `parent_id` → `gliederung` (CASCADE); `idx_gesetz (gesetz_id, sortierung)` |
| `normen` | Einzelnormen (§/Art.) | PK `id`; UNIQUE `(gesetz_id, nummer)`; FK `gesetz_id` (CASCADE), FK `gliederung_id` (SET NULL); FULLTEXT `ueberschrift` |
| `absaetze` | Absätze/Text je Norm | PK `id`; FK `norm_id` → `normen` (CASCADE); `idx_norm (norm_id, sortierung)`; FULLTEXT `inhalt` |
| `fassungen` | Versionen je Gesetz | PK `id`; UNIQUE `(gesetz_id, version_nr)`; `idx_gueltig (gesetz_id, gueltig_ab)`; FK `gesetz_id` (CASCADE), FK `erstellt_von` → `benutzer` (SET NULL) |
| `aenderungslog` | Redaktionsprotokoll | PK `id`; `idx_zeit`, `idx_objekt (objekt_typ, objekt_id)`; FK `benutzer_id` (SET NULL) |
| `benutzer` | Redaktionskonten | PK `id`; UNIQUE `benutzername`; enthält `passwort_hash`, `email` – **für einen Adapter tabu** |

Befund zur Datei: In `aenderungslog` steht hinter `objekt_typ VARCHAR(30) NOT NULL,` ein einzelnes `-` (vermutlich
abgeschnittener Kommentar `--`); das Skript ist so nicht ausführbar. Es ist ein Schemaexport, kein Dump: Daten und das
Format von `fassungen.snapshot` sind unbekannt.

## 2 Mapping auf `legal-core`

### Normidentität: `gesetze` → `NormMeta`

| Bund | Landesrecht | Bemerkung |
| --- | --- | --- |
| `slug` | `slug` | stabil, UNIQUE; `id` (Ganzzahl) nur intern |
| `abkuerzung` | `abbr`; `externalIdentifiers += { system: 'gesetze-sim-internet', value }` | UNIQUE; heutige Linkkennung `federalNormKey(abkuerzung)` |
| `titel`, `kurztitel` | `title`, `shortTitle` | |
| `normtyp` (`paragraf`/`artikel`) | Gliederungseinheit `paragraph` bzw. `article` im Körper | **kein Normtyp** im Sinne von `NormType` (Gesetz/Verordnung fehlen); Standard `gesetz`, Verordnungen nicht unterscheidbar |
| `vollzitat` | `initialCitation` (und `citation` der geltenden Fassung) | |
| `ausfertigungsdatum` | `documentDate` | |
| `fundstelle` („BGBl. I S. 42“) | Teil von `initialCitation`; kein `Publication`-Bezug | nur Text |
| `status` `entwurf`/`in_kraft`/`ausser_kraft` | nicht ausgeliefert / `in-force` / `repealed` | `entwurf` nie anzeigen |
| `inkrafttreten`, `ausserkrafttreten` | `effectiveDate`, `expiryDate` | |
| `stand_datum`, `stand_hinweis` | `lastAmendedDate`, Hinweis „Stand“ | |
| `hinweise` | `dateNote` bzw. amtlicher Hinweis | Freitext |
| `sortiername` | Sortierschlüssel der Liste | |
| `erstellt_am`, `geaendert_am` | Freshness/Drift (nicht fachlich) | |

### Struktur: `gliederung` → Strukturblöcke

`typ` `buch`/`teil`/`kapitel`/`abschnitt`/`unterabschnitt` → `book`/`part`/`chapter`/`section`/`subsection`;
`titel` hat keine eigene Entsprechung (Abbildung als `subsection` mit `label`). `bezeichnung` → `label`,
`ueberschrift` → `title`, Reihenfolge `sortierung`, Baum über `parent_id`.

### Einheiten: `normen` → `paragraph`/`article`

`nummer` + `gesetze.normtyp` → `label` „§ 12a“ bzw. „Art. 12a“, `ueberschrift` → `title`, Einordnung über
`gliederung_id` (NULL = Körperebene), Reihenfolge `sortierung`. `status` `aufgehoben`/`weggefallen` → Einheit mit Text
„(weggefallen)“ bzw. „(aufgehoben)“ wie `repealProvision`; `hinweis` → Hinweis zur Einheit, `fussnote` → Block
`footnote`. Sprunganker `paragraph-12a` wie im Bestand.

### Text: `absaetze` → Untereinheiten

`nummer` gesetzt → `subparagraph` „(n)“ mit `text`; `nummer` NULL → `paragraphText`. `inhalt` ist MEDIUMTEXT mit
**unbekanntem Markup**: die Stile kennen Aufzählungszeilen (`zl-buchstabe`, `zl-doppelbuchstabe`), Tabellen
(`normtabelle`, `tabellenrahmen`), Bilder (`normbild`), Formeln (KaTeX) und Normverweise (`normverweis`). Ein Adapter
braucht dafür einen Parser nach `item`/`subitem`/`table`/`figure`; Formeln haben im Blockmodell keine Entsprechung.

### Fassungen: `fassungen` → `NormVersion`

| Bund | Landesrecht |
| --- | --- |
| `gueltig_ab` | `simulationValidFrom`, `versionId` (Datum, wie im Bestand) |
| `gueltig_bis` | `simulationValidTo` (Landesrecht leitet es sonst aus der Folgefassung ab) |
| `version_nr` | nur Reihenfolge; als `externalIdentifiers`/Hinweis erhalten |
| `aenderungshinweis` | `changeNote` |
| `fundstelle` | `citation` der Fassung |
| `snapshot` (LONGTEXT) | `body` – **Format unbekannt** (vermutlich serialisierter Stand von `gliederung`/`normen`/`absaetze`) |

Geltende Fassung: `normen`/`absaetze` sind der Arbeitsstand; ob er stets einer Zeile in `fassungen` entspricht, ist
offen. Ein Adapter muss die maßgebliche Fassung wie bei OstRecht aus Intervall und Landesrecht-Stichtag ableiten.

## 3 Lücken gegenüber Landesrecht

| Merkmal | im Bundesportal? | ableitbar? | für read-only-Adapter nötig? |
| --- | --- | --- | --- |
| Source Provenance (reale Quelle, Hash, Abruf) | nein | nein | nein – Bund ist selbst Sim-Quelle; Provenienz = Bundesportal (`provider-record`) |
| Verkündungen / Blattausgaben | **nicht im Schema**, aber Oberfläche kennt Ausgaben, Jahrgänge, Stücklisten, PDF | nein | nur für Verkündungsseiten; eigene Datenquelle nötig |
| Getrennte Quell-/Simulationsgeltung | nur eine Achse (`gueltig_ab/bis`) | ja (= Simulationsachse) | nein |
| Relationen (ändert/geändert durch) | nein, nur `aenderungshinweis`-Text und Normverweise im Text | teilweise aus Text | nein für Anzeige, ja für Querverweise |
| Änderungsrezepte | nein – redaktionelle Pflege mit Snapshots | nein | nein (Fassungen genügen) |
| Historische Fassungen | ja (`fassungen.snapshot`) | – | ja, Snapshot-Format klären |
| Assets/Anlagen | Bilder im Text (`normbild`), keine Asset-Tabelle | Ablage unbekannt | ja für vollständige Texte |
| Suche | MySQL FULLTEXT (Titel, Überschriften, Absätze) – nur Arbeitsstand, Snapshots nicht indexiert | – | ja; historische Volltextsuche fehlt wie bei OstRecht |
| External IDs | `abkuerzung`, `slug`, `id` | – | `abkuerzung` genügt |
| Normtyp (Gesetz/VO) | nein (`normtyp` = §/Art.) | nein | ja für Filter; Standardwert nötig |
| Jurisdiktion | – | – | `bund` ist heute nur Verweisziel (`FEDERAL_JURISDICTION_ID`), keine `JurisdictionId` |

## 4 Oberflächenkonzepte (aus `style.css`, nur funktional)

Das Design von landesrecht-online.de bleibt unverändert; die Stile werden nicht übernommen.

| Konzept im Bundesportal | Klassen | Landesrecht heute |
| --- | --- | --- |
| A–Z-Leiste, Buchstabengruppen | `buchstabenleiste`, `buchstabengitter` | nein (Listen je Land und Typ) |
| Suche mit Vorschlägen, Treffer-Snippets | `grosse-suche`, `vorschlaege`, `trefferliste`, `treffer-ausschnitt` | ja (Suche, Snippets); keine Vorschläge |
| Gliederungsübersicht, Sprunglinks | `uebersicht-gliederung`, `gl-*`, `sprunglink` | ja (`NormOutline`) |
| Fassungsliste, Fassungsvergleich, Synopse | `fassungsliste`, `vergleich-*`, `v-*`, `vz-*`, `synopse` | ja (Historie, Vergleich) |
| Verkündungen: Jahrgänge, Ausgaben, Stückliste, PDF | `jahrgangsleiste`, `ausgabenliste`, `stueckliste`, `pdf-marke` | ja (Verkündungsseiten, Belege statt PDF-Download) |
| Fußnoten | `fussnote`, `fussnote-marke` | ja (Block `footnote`) |
| Tabellen, Bilder | `normtabelle`, `normbild` | ja (`table`, `figure`) |
| Formeln | `formel`, `katex-display` | **nein** |
| Status-Kennzeichen, Entwurfs-Warnbalken | `kennzeichen-*`, `warnbalken-entwurf` | Status ja; Entwürfe werden nicht ausgeliefert |
| Simulationshinweis | `simbalken`, `kennzeichen-sim` | ja (Hinweisleiste) |
| Sachgebiete | `themenwolke`, `thema-chip` | Sachgebiete als Metadaten |
| Druck | `drucksteuerung`, `druckfuss` | Druckstile |
| Hinweis beim Verlassen | `vh-*` (Dialog) | nein |

## 5 Architektur (analog zur Ost-Entscheidung)

| | A: direkte Anbindung (`BundesrechtStore`) | B: direkte Quelle + kleine Suchprojektion | C: vollständiger Import/Kopie |
| --- | --- | --- | --- |
| Source of Truth | Bundesportal allein | Bundesportal; Projektion abgeleitet | zweite Kopie in Landesrecht |
| Technik | Worker → HTTP-API des Portals **oder** MySQL über Cloudflare Hyperdrive (neue Ressource, DB-Zugang, Netzfreigabe) | wie A, plus abgeleiteter Index (historische Fassungen) | Export → `content/norms/bund` bzw. D1 |
| Voraussetzung | API oder read-only-DB-Nutzer ohne `benutzer`/`aenderungslog` | wie A | Dump/Export |
| Drift | keine (Laufzeit liest Quelle) | Index kann veralten → Freshness-Gate | hoch, manuelle Pflege doppelt |
| Suche | MySQL FULLTEXT nur Arbeitsstand; Ranking fremd | eigene Suche inkl. Fassungen | eigene Suche |
| Aufwand | mittel (Adapter, Markup-Parser, Snapshot-Format) | mittel–hoch | hoch, laufend |

**Empfehlung: A**, sobald eine read-only-Quelle besteht – bevorzugt eine **versionierte HTTP-Export-API des
Bundesportals** (JSON je Gesetz mit Fassungen; keine DB-Zugangsdaten im Worker, keine neue Cloudflare-Ressource). Eine
direkte MySQL-Anbindung über Hyperdrive nur mit eigenem read-only-Nutzer ohne Zugriff auf `benutzer`/`aenderungslog`.
B erst, wenn historische Volltextsuche für Bund gebraucht wird; C nicht (zweite gepflegte Kopie). Datenfluss:
`Bundesportal DB/API → BundesrechtStore (read-only, Schema-Contract, Drift-Audit) → Landesrecht`.

Einordnung in Landesrecht ohne Bund-Sonderlogik im Kern: `bund` ist heute keine `JurisdictionId`. Zwei Wege, zu
entscheiden vor der Umsetzung: (1) Bund als `LegalProvider` mit `providesNorms: true` für Verweisauflösung und
Normanzeige über eine generische Norm-Schnittstelle, oder (2) Erweiterung der Jurisdiktionsliste um eine externe
Jurisdiktion mit `runtimeSource`, analog `ostrecht-d1`. Beides ist eine generische Modellentscheidung, keine
Bund-Sonderstruktur.

## 6 Was für eine echte Integration fehlt

1. Zugriffsweg: API (Endpunkte, Auth ohne Nutzerpasswörter) oder read-only-DB-Nutzer; Betreiberzustimmung.
2. Format von `fassungen.snapshot` und Markup von `absaetze.inhalt` (Beispieldaten oder Dump ohne `benutzer`).
3. Ablage der Bilder (`normbild`) und der Verkündungsdaten (Ausgaben, Stücklisten, PDF) – nicht im Schema.
4. Normtyp (Gesetz/Verordnung) und Umgang mit `entwurf`.
5. Korrigiertes Schema (`aenderungslog`, stray `-`).
6. Entscheidung zur Jurisdiktionseinordnung (Abschnitt 5).

Aufwand nach Klärung von 1–3: Adapter mit Contract-Test und Fixture etwa 3–5 Personentage, Suche über Portal-FTS
zusätzlich 1–2; Risiken: unbekanntes Markup, Stichtagsabweichung (Portal vs. `EDITORIAL_REFERENCE_DATE`), fehlende
Verkündungsdaten, DB-Exposition bei Hyperdrive.
