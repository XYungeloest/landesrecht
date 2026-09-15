# RECHT.NRW-Import (Land Nordrhein-Westfalen → Land Westdeutschland)

```text
RECHT.NRW importer (LRGV + LRMB):
Phase 2 / hardened, validated sample corpora (12 LRGV, 15 LRMB)
not yet full baseline import
```

Stand: gehärteter Importpfad für Gesetze und Rechtsverordnungen (Bereich LRGV) mit validiertem
Beispielkorpus (12 Vorschriften), gemeinsamer Importer für Verwaltungsvorschriften (Bereich LRMB,
`docs/RECHT_NRW_LRMB_IMPORT.md`), gemeinsames Manifest, Review-Queue und Coverage-Report. Was aufgenommen
wird, regelt `docs/LEGAL_SCOPE.md`; der vollständige Ausgangsimport ist ein eigener Auftrag
(`docs/RECHT_NRW_BULK_IMPORT.md`).

## 1. Technische Struktur von RECHT.NRW (Befund September 2026)

RECHT.NRW ist ein Drupal-10-Portal (`https://recht.nrw.de`). Die früheren Oracle-Adressen
(`/lmi/owa/br_bes_text?…`, `br_text_anzeigen?v_id=…`) leiten nur noch auf die Suchseite oder auf
Taxonomie-Terme weiter und tragen keine Inhalte mehr.

| Frage | Befund |
| --- | --- |
| Stammnorm | Drupal-Taxonomie-Term. Jede Fassungsseite trägt unter „Weitere Funktionen“ den Link „Link zur aktuellsten Fassung“ auf `/taxonomy/term/<id>`; der Term leitet per Meta-Refresh auf die jeweils aktuellste Fassung weiter. Diese numerische ID ist die stabile, portalseitige Kennung der Stammnorm. Eine amtliche Gliederungsnummer (SGV. NRW.) wird auf den Seiten nicht ausgewiesen (nur im Dateinamen mancher Anlagen, z. B. `sgv_216_…`). |
| Fassungen | Eigene Seiten unter `/lrgv/<gesetz\|rechtsverordnung\|bekanntmachung>/<TTMMJJJJ>-<slug>`; das Datum im Pfad ist der Geltungsbeginn („Gültig ab“). Die Fassungsliste (`li.version-item`) einer Seite nennt alle Fassungen der Stammnorm mit Datum, die aktuelle Seite („aktuelle Seite“) und nicht abrufbare Altfassungen („nicht darstellbar“). Alle Fassungsseiten stehen in den Sitemaps (`/sitemap/page/<n>/sitemap.xml`, 36 Seiten, ≈ 36 000 Adressen; davon ≈ 3 200 `lrgv/gesetz`, ≈ 5 800 `lrgv/rechtsverordnung`). |
| Gültig ab / bis | Infobox `#block-rnrw-legal-document-info-box`, Beschriftungen `field__label` „Gültig ab“ / „Gültig bis“ mit deutschem Datum; „Gültig bis“ fehlt bei offener Fassung. Neuere Datensätze tragen zusätzlich „Ausfertigungsdatum“, „Verkündet durch“ (Fundstelle) und „Vollzitat“. |
| Normtyp, Titel | Dokumentart aus dem URL-Segment (`gesetz`, `rechtsverordnung`); Titel im `<h1>`, Kurzbezeichnung und Abkürzung in Klammern oder Gedankenstrichen („… (Verwaltungsverfahrensgesetz NRW – VwVfG NRW)“, „… – AbgG NRW –“). |
| Änderungshistorie | Kopfanhang „Änderungshistorie“ (`div.change-history-item`) bei neueren Datensätzen; bei Legacy-Datensätzen Fußnote 1 (`p.lrfundstelle`) im Textdokument. |
| Textformate | **Legacy**: `<iframe src="/system/files/BH/<id>.htm">` mit aus Word exportiertem HTML (`p.lrueberschrift` Titel, `p.lrdetail` §-/Artikelüberschrift, zentrierte fette Absätze als Gliederung, `(1)`-Absätze, eingerückte Nummerierungen über `margin-left`, Fußnotentabelle mit `<a name=FNn>` am Ende, Word-Hilfselemente `<o:p>`, `<u5:p>`…, teils ungeschlossen). **Nativ**: `#block-rnrw-content` mit `field--field_preamble`, `field--field_body` (je Einheit `section.legaldoc-article` mit `h2 > span.field--field_num`, optional `span.field--field_headline`, Fußnoten je Einheit in `div.footnote-item`, Text in `div.field--field_text`) und `field--field_conclusions`; Gliederungsüberschriften stehen als zentrierte `<strong>`-Absätze am Ende des vorangehenden Einheitentexts. Am Stichtag 2023-12-01 liegen beide Formate nebeneinander vor. |
| Inhaltsübersicht | Legacy: Tabelle oder Absatzfolge nach „Inhaltsübersicht“; nativ: `<table>` im Vorspann. Wird als Tabelle übernommen (redundant zur Struktur, aber verlustfrei). |
| Listen, Tabellen, Anlagen | Listen sind Absätze mit Kennzeichen („1.“, „a)“), im Legacy-Format zusätzlich eingerückt; Tabellen `<table>`; Anlagen im nativen Format als separate Dateien (`/system/files/BA/…` als HTM oder PDF, Kopfanhang „Anlagen“), im Legacy-Format als Überschrift „Anlage“ im Text. |
| PDF | Nur native Datensätze verlinken eine PDF der konsolidierten Fassung (`/system/files/pdf/…`, Link mit `download`). |
| Enumeration | (a) Sitemaps (vollständig, aber je Fassung eine Adresse); (b) OpenSearch-Middleware der Suche (`POST /search-middleware/opensearch_internet/_search`, Index `opensearch_internet`, Typ `state_law_and_regulations`), die je Stammnorm nur die aktuellste Fassung mit `uuid`, `url`, `field_document_type_name`, `field_effective_from`, `field_inforce_date`, `field_outforce_date`, `field_historically`, `field_pdf_file_url` liefert. Beide werden im Bulk-Plan kombiniert. |

Quellidentität im kanonischen Modell: `externalIdentifiers: [{ system: "recht-nrw", value: "term:<id>", url: "https://recht.nrw.de/taxonomy/term/<id>" }]`.
Es wird keine Kennung erfunden; die Term-ID ist echt, aber keine amtliche Nummer.

## 2. Pipeline und Module

```text
Fetch → Archive Raw Source → Parse Source Format → Normalize Source Law
  → Select Source Version at Baseline (lokal fail-closed) → Detect (Quelltext) → Transform → Post-Transform Audit
  → Validate → Write Canonical JSON → Project to D1 → Audit (Manifest, Review-Queue, Coverage)
```

| Stufe | Modul (`packages/importers/recht-nrw/src/`) |
| --- | --- |
| Fetch | `common/fetcher.ts` – sequenziell, Mindestabstand 1 s, Timeout 20 s, 3 Wiederholungen mit Backoff (2/4/8 s, bei 429 verdoppelt), Fehlerklassen `timeout\|network\|http\|rate-limited\|forbidden\|not-found\|invalid-url`, lokaler Cache `.cache/recht-nrw/`, User-Agent `landesrecht-portal-importer/0.1 (+https://gitlab.com/politiksim/landesrecht)`. Keine Umgehung von Zugriffsbeschränkungen. |
| Archive | `sources/recht-nrw/term-<id>/<sha256[0..16]>-<rolle>.<ext>` (versioniert, unveränderte Bytes); produktiv R2. |
| Parse | `common/version-page.ts`, `common/legacy-parser.ts`, `common/native-parser.ts`, `common/body-common.ts`; LRMB: `lrmb/parser.ts`. Fail-closed: unbekannte Elemente und Bilder sind Fehler. |
| Normalize | `lrgv/normalize.ts` → Nordrhein-Westfalen bleibt Nordrhein-Westfalen. |
| Select | `common/version-selection.ts` (Abschnitt 3); die gewählte Seite muss Beginn und Ende der Fassungsliste bestätigen (`selection-page-contradiction`). |
| Detect / Transform / Audit | `transform/detection.ts`, `transform/rules.ts`, `transform/organs.ts`, `transform/transform.ts` (Abschnitte 4–6). |
| Validate | Schema-Parser, `validateNormRecord`, `assertBaselineConsistency`, Schutz der Quellmetadaten, Textintegrität (`common/integrity.ts`). |
| Write | `common/persist.ts`: `content/norms/west/<slug>/{meta.json,history.json,versions/2023-12-01.json}`, `data/audits/recht-nrw/<slug>.json`; vorhandene weitere Fassungen werden nie überschrieben. |
| Audit | `common/manifest.ts` (Schema 2), `common/review-queue.ts`, `common/review-derivation.ts`, `common/coverage.ts`; `cli.ts audit`. |

Dry-run ist Standard; nur `--write` schreibt. Jeder Befund `error` bricht vor dem Schreiben der Norm ab;
`warning` führt zu `imported-with-warnings`. Review-Fälle werden im Schreiblauf auch bei Fehlschlägen
festgehalten.

## 3. Stichtagsauswahl: lokal fail-closed

Gewählt wird genau die Fassung mit `sourceValidFrom <= 2023-12-01 AND (sourceValidTo IS NULL OR
sourceValidTo >= 2023-12-01)`. Blockiert wird nur, was die Stichtagsfassung betrifft:

| Befund (`SelectionFinding.code`) | Wirkung |
| --- | --- |
| `baseline-no-version`, `baseline-gap` | keine Fassung am Stichtag |
| `baseline-multiple-versions` | mehrere Fassungen am Stichtag (Überlappung oder gleicher Beginn) |
| `baseline-version-not-renderable` | Stichtagsfassung „nicht darstellbar“ |
| `baseline-contradictory-interval` | Ende vor Beginn an der Stichtagsfassung |
| `baseline-adjacent-gap`, `baseline-adjacent-overlap` | Lücke oder Überlappung zur unmittelbaren Vor- oder Folgefassung |
| `baseline-neighbour-ambiguous`, `baseline-neighbour-contradictory` | Vor-/Folgefassung mehrdeutig oder widersprüchlich |
| `baseline-undated-version` | Fassung ohne Datum (Lage unbekannt, Auswahl wäre geraten) |
| `history-gap`, `history-overlap`, `history-same-start`, `history-contradictory-interval` | **Warnung**: weit entfernte Befunde; Import läuft, Review `historical-gap` |

Zusätzlich muss die abgerufene Stichtagsseite der Fassungsliste entsprechen (`selection-not-confirmed`,
`selection-page-contradiction`). Beispiel ÖPNVG: Einstieg über die Fassung ab 16.12.2023, gewählt
01.01.2020 – 15.12.2023. Eine dokumentierte redaktionelle Entscheidung kann `sourceValidTo`
überschreiben (`overrides`, KiBiz).

## 4. Erlassorgan: nie aus dem Normtyp

Befund: RECHT.NRW führt kein Feld für das erlassende Organ (weder Infobox noch Suchindex). Belege stehen
nur im Text: Eingangsformeln („Der Landtag Nordrhein-Westfalen hat … folgendes Gesetz beschlossen“,
„… verordnet das Ministerium für Kinder, Familie, Flüchtlinge und Integration …“), Erlassköpfe von
Verwaltungsvorschriften („Runderlass des Ministeriums des Innern“) und Unterschriften. Unterschriften
belegen die Ausfertigung, nicht das Erlassorgan, und werden nicht verwendet. Eigene Felder für
herausgebende, verkündende oder zuständige Stelle wären nicht getrennt belegbar; deshalb:

| Feld | Inhalt |
| --- | --- |
| `meta.originEnactingBody` | Organ laut ausdrücklicher Formel, wörtlich (nur Kopfwort in den Nominativ); Provenienz, nie transformiert |
| `meta.enactingBody` | Simulationsorgan nur, wenn sicher: Verfassungsorgane (Landtag, Landesregierung, Ministerpräsident) mit übergeleiteter Landesbezeichnung; Ministerien und Behörden bleiben leer (Review `institution-mapping`) |
| Transformationsreport `organs` | Formel, Fundstelle im Text, Kandidaten, Entscheidung und Begründung |

Widersprüchliche Formeln führen zu keinem Organ. Ohne Formel bleibt das Organ leer.

## 5. Erkennung vor der Transformation, Transformation, Prüfung danach

Alle landesbezogenen Bezeichnungen werden auf dem **unveränderten Quelltext** erkannt, klassifiziert und
entschieden; erst dann wird transformiert; danach wird geprüft.

| Kategorie | Beispiele | Entscheidung |
| --- | --- | --- |
| `jurisdiction-name` | Land/Landes Nordrhein-Westfalen, nordrhein-westfälisch, NRW | `safe-auto-transform` mit benannter Regel; Restformen ohne sichere Regel („Gesetz NRW.“, Genitiv) `manual-review` |
| `legislature` | Landtag Nordrhein-Westfalen | `safe-auto-transform` (nur die Landesbezeichnung) |
| `institution` | Landesregierung/Verfassungsgerichtshof Nordrhein-Westfalen; Oberverwaltungsgericht für das Land Nordrhein-Westfalen | Verfassungsorgane `safe-auto-transform`, Gerichte `manual-review` |
| `ministry` | Ministerium für Schule und Bildung, Innenministerium | `manual-review` (historische Bezeichnung bleibt) |
| `authority` | Bezirksregierung, Landesamt für …, Landesbetrieb …, Landeskriminalamt | `manual-review` |
| `public-body` | Unfallkasse Nordrhein-Westfalen, Ärztekammer Westfalen-Lippe | `manual-review` |
| `regional-body` | Landschaftsverband, Regionalverband Ruhr, Regierungsbezirk | `manual-review` |
| `municipality`, `geography` | Köln, Düsseldorf; Rheinland, Ruhr | `manual-review` |
| `source-citation` | GV. NRW., GV. NW., SGV. NRW., MBl. NRW., SMBl. NRW., MB.NRW, URLs | `protected` |
| `external-name` | IT.NRW, WDR, LVR, LWL, NRW.BANK | `protected` |
| `other` | – | Reserve |

Regeln (`transform/rules.ts`, Reihenfolge = Priorität): `Landes Nordrhein-Westfalen` → `Landes
Westdeutschland`; `im/dem/vom/beim Land Nordrhein-Westfalen` → `… Land Westdeutschland`; `Land
Nordrhein-Westfalen` → `Land Westdeutschland`; `nordrhein-westfälisch…` → `westdeutsch…`;
`Nordrhein-Westfalen` → `Westdeutschland`; freistehendes `NRW` → `West`. Schutzstellen werden
längengleich maskiert; jede Ersetzung wird mit Quellposition geplant.

Prüfung nach der Transformation (`auditTransformation`): Jede verbliebene Landesbezeichnung muss
geschützt oder als Erkennung mit Entscheidung dokumentiert sein; jede sichere Ersetzung muss angewandt und
protokolliert sein; kein Feld darf sich ohne Protokoll ändern. Sonst Fehler `post-transform-audit`.

Report `data/audits/recht-nrw/<slug>.json` (`recht-nrw-transformation-report/2`): `detections` (Pfad,
Quellposition, Begriff, Kontext, Kategorie, Entscheidung, Regel, Begründung), `decisions` (Kategorie →
Entscheidung → Anzahl), `changes`, `unresolved` (alle `manual-review`), `postTransformAudit`, `organs`,
`citations`, `protectedFields`, `integrity`.

## 6. Fundstellen: Quelle und Simulation getrennt

| Feld | Inhalt | Transformiert |
| --- | --- | --- |
| `meta.initialCitation` | Simulationsfundstelle der Stammfassung („… in der am 1. Dezember 2023 übernommenen Fassung (Ausgangsrechtsstand West)“) | ja (Titel) |
| `meta.sourceCitation` | reale Fundstelle („… vom 14. Juli 1994 (GV. NW. 1994 S. 666)“) | nie |
| `version.citation` | Simulationsfundstelle der Fassung | ja |
| `version.sourceCitation` | Vollzitat der Quellfassung (Infobox „Vollzitat“, sonst reale Fundstelle) | nie |
| `version.sourceStatus` | Quellenlage (`exact`, `verified-active-at-baseline`, `reconstructed`; Text `direct`/`reconstructed`) | – |
| `history.entries[0].note` | „Quelle: …“ und reale Änderungshistorie | nie |

Migrationssicher: optionale Felder im Schema, D1 speichert Metadaten und Fassungen als JSON (keine
Migration), OstRecht-Datensätze ohne die Felder bleiben gültig. Die zwölf Ausgangsfassungen wurden dafür
einmalig neu erzeugt (Normkörper unverändert; `content:immutability` mit `--allow` je Fassung).

## 7. Textintegrität

`common/integrity.ts`: Fetch → Parse vergleicht Kennzahlen des Roh-HTML (Zahl der §/Artikel-Überschriften,
Tabellen, sichtbarer Textumfang ohne Fußnotentabelle) mit dem geparsten Quellzustand (Toleranz Textumfang
−12 %/+24 %); Source → Canonical verlangt identische Einheiten, Blöcke, Tabellen, Anlagen,
Fußnotenblöcke und Einheitenfolge sowie Textumfang ±3 %; doppelte Einheitenkennzeichen sind ein Fehler.

## 8. Manifest, Review-Queue, Coverage (LRGV und LRMB)

- `data/imports/recht-nrw/manifest.json` (Schema 2): je Stammnorm `sourceArea`, `sourceDocumentType`,
  `sourceIdentity`, `sourceTitle`, `sourceUrl`, `sourceVersion`, `baselineStatus`, `validityEvidence`,
  `retrievedAt`, `sha256`, `parserVersion`, `transformerVersion`, `targetJurisdiction`, `targetSlug`,
  `importStatus`, `reviewStatus`, `reconstructionStatus`, `reconstructionSources`, `reconstructionSteps`
  sowie Rohquellen, geprüfte Fassungen, Befunde, Integrität und Transformationszahlen. Manifeste der
  Version 1 werden beim Lesen hochgestuft.
- `data/imports/recht-nrw/review-queue.json`: Kategorien `version-selection`, `source-unavailable`,
  `historical-gap`, `reconstruction-required`, `reconstruction-uncertain`, `unknown-structure`,
  `text-integrity`, `normativity`, `institution-mapping`, `slug-collision`, `attachment`,
  `metadata-conflict`, `other`. Stabile Kennung je Quelle, Kategorie und Schlüssel; Fälle verschwinden
  bei Reimport nicht (`occurrence: not-reproduced`), Entscheidungen (`resolved`, `accepted`) bleiben.
- `data/audits/recht-nrw/coverage.json`: LRGV enumeriert / am Stichtag / importiert / Review / nicht
  verfügbar / ausgeschlossen; LRMB enumeriert / normativ / am Stichtag / direkt / rekonstruiert / Review /
  ausgeschlossen; offene Review-Fälle; Qualitätskennzahlen. Das Audit prüft die Datei gegen Manifest und Queue.

## 9. Validierungskorpus LRGV (12 Vorschriften)

| Slug | Quelle | Stichtagsfassung | Format | Grund |
| --- | --- | --- | --- | --- |
| `verfassung-fuer-das-land-westdeutschland` | Verfassung für das Land NRW | 14.07.2020 – 15.01.2026 | nativ | verfassungsnah, Artikel, Teile/Abschnitte, 46 Fußnoten, Unterschriftentabelle |
| `go-west` | Gemeindeordnung (GO NRW) | 01.01.2023 – 30.12.2023 | legacy | großes Gesetz (§§ 1–135, 45 Fassungen), Folgefassung 30 Tage nach Stichtag |
| `vwvfg-west` | VwVfG NRW | 05.05.2023 – 31.12.2024 | legacy | viele Paragraphen, mehrstufige Listen, Abkürzung mit `NRW` |
| `baugb-ag-west` | BauGB-AG NRW | 12.09.2023 – 31.08.2026 | nativ | Ausführungsgesetz zu Bundesrecht, Vorspann/Schlussformel |
| `lbtg-west` | Landesbetreuungsgesetz | 01.01.2023 – 29.12.2023 | legacy | Folgefassung kurz nach dem Stichtag |
| `oepnvg-west` | ÖPNVG NRW | 01.01.2020 – 15.12.2023 | legacy | Versionsauswahl-Test, Inhaltsübersicht als Tabelle |
| `abgg-west` | AbgG NRW | 01.07.2023 – 31.01.2024 | legacy | 26 historische Fassungen, drei nicht darstellbar |
| `loeg-west` | LÖG NRW | 30.03.2018 – offen | nativ | Stichtagsfassung deutlich früher begonnen |
| `kibiz-west` | KiBiz | 01.08.2022 – 31.07.2026 (Override) | nativ | HTM-Anlage mit Tabellen, widersprüchliches „Gültig bis“ |
| `verordnung-ueber-umzugskostenentschaedigung-tagegelder-und-west` | Umzugskosten-VO | 27.07.2013 – offen | nativ | Rechtsverordnung, seit 2013 unverändert |
| `dvo-kibiz-west` | DVO KiBiz | 27.04.2021 – offen | nativ | Verordnungsformel eines Ministeriums |
| `schulg-west` | SchulG NRW | 09.03.2022 – 06.06.2025 | legacy | sehr großes Gesetz, Belastungstest |

Wiederholungslauf nach der Härtung (15. September 2026, ohne manuelle Eingriffe, nur Cache):

| Prüfung | Ergebnis |
| --- | --- |
| Stichtagsauswahl, Quellintervalle, Slugs | 12/12 unverändert |
| Normkörper | 12/12 identisch mit dem Stand vor der Härtung |
| Rohquellen | alle SHA-256 unverändert; 0 Netzabrufe |
| Erlassorgane | erfundene Organe (Landtag/Landesregierung aus dem Normtyp) entfernt; Verfassung: Quellorgan „Landtag Nordrhein-Westfalen“ aus der Eingangsformel, Simulationsorgan „Landtag Westdeutschland“; DVO KiBiz: Quellorgan „Ministerium für Kinder, Familie, Flüchtlinge und Integration“ (vorher fälschlich „Landesregierung“) |
| Befunde | alle 101 früheren Unresolved-Einträge in 472 Erkennungen enthalten (148 manuelle Entscheidungen); Prüfung nach Transformation 12/12 ok |
| Fundstellen | Simulation und Quelle getrennt |
| Determinismus | zweiter Lauf: 55 Dateien, 41 byteidentisch, 14 nur mit abweichenden Zeitstempeln |
| D1, Suche, Routing | `d1:schema:check` und Tests ok |

Die synthetische Fixture-Norm heißt jetzt `testfixture-schulgesetz-west` („Testfixture Schulgesetz …“),
damit sie nicht mit der importierten `schulg-west` verwechselt wird.

## 10. Bedienung

```sh
npm run import:recht-nrw:inspect -- --url <url>          # Seite analysieren (LRGV oder LRMB)
npm run import:recht-nrw -- --url <url> [--write]        # Einzelimport (Bereich aus der Adresse)
npm run import:recht-nrw:lrgv:sample [-- --write]        # LRGV-Korpus (auch: import:recht-nrw:sample)
npm run import:recht-nrw:lrmb:sample [-- --write]        # LRMB-Korpus mit Erwartungsvergleich
npm run import:recht-nrw:review [-- --area lrgv|lrmb]    # offene Review-Fälle
npm run import:recht-nrw:coverage [-- --write]           # Coverage-Report
npm run import:recht-nrw:audit                           # Manifest, Hashes, Dateien, Reports, Rekonstruktionen, Queue, Coverage
```

Optionen: `--offline` (nur Cache), `--cache-dir <pfad>`, `--baseline <datum>`, `--json`, `--area`.
Nach einem Schreiblauf: `npm run content:check`, `npm run d1:schema:check`, `npm run test`,
`npm run d1:seed:dev` und Sichtprüfung unter `/west/`, `/west/norm/<slug>/`, `/west/norm/<slug>/daten/`,
`/west/norm/<slug>/quellen/`.

## 11. Bundesrechtsverweise

Der Parser extrahiert noch keine Verweise auf Bundesrecht (z. B. „§ 35 BauGB“). Die Provider-/Resolver-
Architektur (`packages/providers`, `LegalReference`) ist vorbereitet; eine Erkennung allein über Textmuster
wäre riskant (Abkürzungskollisionen). Folgeschritt: kuratierte Abkürzungsliste + Extraktion je Einheit +
Prüfung vor der Verlinkung.

## 12. Verwaltungsvorschriften

Verwaltungsvorschriften (Bereich LRMB) werden über denselben Importer in einem eigenen Quellbereich
übernommen: `docs/RECHT_NRW_LRMB_IMPORT.md`.

## 13. Bekannte Grenzen

- PDF-Anlagen werden nur als Quelle registriert, nicht als Text übernommen (Review `attachment`).
- Inline-Auszeichnung und Links werden nicht übernommen (Text bleibt vollständig).
- Fußnotennummern des nativen Formats werden dokumentweit fortlaufend vergeben.
- Restformen der Landesbezeichnung ohne sichere Regel („VwVfG. NRW.“, „…gesetzes NRW.“) bleiben unverändert und stehen als manuelle Entscheidung im Report (7 Stellen im Korpus).
- Ministerien, Behörden, Kommunen und Regionen werden nicht übergeleitet; eine redaktionelle Zuordnung fehlt.
