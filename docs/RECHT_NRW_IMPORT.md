# RECHT.NRW-Import (Land Nordrhein-Westfalen → Land Westdeutschland)

```text
RECHT.NRW importer:
Phase 2 / validated sample corpus
not yet full baseline import
```

Stand: Importpfad mit validiertem Beispielkorpus (12 Vorschriften aus dem Bereich LRGV). Der
vollständige Ausgangsimport aller am 1. Dezember 2023 geltenden Gesetze und Rechtsverordnungen ist
ein eigener Auftrag (`docs/RECHT_NRW_BULK_IMPORT.md`). Verwaltungsvorschriften (Bereich LRMB /
Ministerialblatt) werden mit diesem Importer nicht übernommen (siehe unten).

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

## 2. Pipeline

```text
Fetch → Archive Raw Source → Parse Source Format → Normalize Source Law
  → Select Source Version at Baseline → Transform into Simulation Jurisdiction → Validate
  → Write Canonical JSON → Project to D1 → Audit
```

| Stufe | Modul (`packages/importers/recht-nrw/src/`) |
| --- | --- |
| Fetch | `fetcher.ts` – sequenziell, Mindestabstand 1 s, Timeout 20 s, 3 Wiederholungen mit Backoff (2/4/8 s, bei 429 verdoppelt), Fehlerklassen `timeout\|network\|http\|rate-limited\|forbidden\|not-found\|invalid-url`, lokaler Cache `.cache/recht-nrw/` (Bytes + Metadaten, SHA-256-geprüft), User-Agent `landesrecht-portal-importer/0.1 (+https://gitlab.com/politiksim/landesrecht)`. Keine Umgehung von Zugriffsbeschränkungen. |
| Archive | `pipeline.ts` – `sources/recht-nrw/term-<id>/<sha256[0..16]>-<rolle>.html` (versioniert, unveränderte Bytes); Quellenreferenzen mit `availability: versioned`, `localSource`, `sha256`, `url`, `retrievedAt`. Produktiv kompatibel mit R2 (`objectKey` nach `packages/runtime/src/bindings.ts`). |
| Parse | `version-page.ts` (Drupal-Seite), `legacy-parser.ts` (Word-HTML), `native-parser.ts` (Drupal-Dokument), `body-common.ts` (Gliederung, Einheiten, Absätze, Listen, Tabellen, Fußnoten, Verschachtelung). Fail-closed: unbekannte Blockelemente, Absatzklassen, Inline-Elemente und Bilder sind Befunde der Stufe `error`. |
| Normalize | `normalize.ts` → `RechtNrwSourceLaw`: Nordrhein-Westfalen bleibt Nordrhein-Westfalen (Titel, Abkürzung, Zitat, Text, Fußnoten, Anlagen, Quellen, Term-ID). |
| Select | `version-selection.ts` – `sourceValidFrom <= 2023-12-01 AND (sourceValidTo IS NULL OR sourceValidTo >= 2023-12-01)`; Lücke, Überlappung, fehlende Daten, Mehrdeutigkeit, nicht darstellbare Fassung → Abbruch. Die gewählte Seite wird abgerufen und ihre Infobox muss den Stichtag bestätigen. |
| Transform | `transform.ts` – explizite Regeln, Schutzmuster, Unresolved-Report (siehe 4). |
| Validate | Schema-Parser, `validateNormRecord`, `assertBaselineConsistency`, Schutz der Quellmetadaten, Textintegrität (`integrity.ts`). |
| Write | `content/norms/west/<slug>/{meta.json,history.json,versions/2023-12-01.json}`, `data/audits/recht-nrw/<slug>.json`, `data/imports/recht-nrw/manifest.json`. Vorhandene weitere Fassungsdateien werden nie überschrieben. |
| Project | Projektionsplan für `west` (Statistik im Ergebnis); lokale Seeds über `npm run d1:seed:local` / `d1:seed:dev`. |
| Audit | Manifesteintrag mit Befunden, Integritätsstatus und Transformationszahlen; `npm run import:recht-nrw:audit` prüft Hashes, Dateien und Reports. |

Dry-run ist Standard; nur `--write` schreibt. Jeder Befund `error` bricht den Schreiblauf vor dem
Schreiben ab; `warning` (z. B. Unresolved-Bezeichnungen, PDF-Anlage) führt zu
`imported-with-warnings`.

## 3. Zeitmodell

Die reale Fassung behält `sourceValidFrom`/`sourceValidTo` (aus der Infobox, offen = fehlt). Die
Simulationsfassung erhält `versionId = 2023-12-01`, `simulationValidFrom = 2023-12-01`,
`simulationValidTo = null`; `history.json` führt sie als `initial` mit der realen
Änderungshistorie als Notiz. Beispiel ÖPNVG: Einstieg über die Fassung ab 16.12.2023 → gewählt wird
die Fassung 01.01.2020 – 15.12.2023 → im Portal `sourceValidFrom 2020-01-01`, `sourceValidTo
2023-12-15`, Simulation ab 2023-12-01.

Eine dokumentierte redaktionelle Entscheidung kann `sourceValidTo` überschreiben
(`overrides` im Korpus/Manifest mit Begründung). Anwendungsfall: KiBiz, dessen Infobox ein
„Gültig bis“ vor dem Geltungsbeginn zeigt.

## 4. Transformation und Unresolved-Report

Regeln (`TRANSFORMATION_RULES`, in dieser Reihenfolge): `Landes Nordrhein-Westfalen` →
`Landes Westdeutschland`; `im/dem/vom/beim Land Nordrhein-Westfalen` → `… Land Westdeutschland`;
`Land Nordrhein-Westfalen` → `Land Westdeutschland`; `nordrhein-westfälisch…` → `westdeutsch…`;
`Nordrhein-Westfalen` → `Westdeutschland`; freistehendes `NRW` → `West` (Abkürzungen wie
`VwVfG NRW` → `VwVfG West`, Projektkonvention wie `SchulG West`).

Geschützt (nie ersetzt): Fundstellen- und Verkündungsblattkürzel (`GV. NRW.`, `GV. NW.`, `SGV. NRW.`,
`MBl. NRW.`, `BGBl.`), externe Namen (`IT.NRW`, `WDR`, `LVR`, `LWL`), URLs. Unverändert bleiben
außerdem alle Quellmetadaten: `sourceReferences`, `initialCitation`, `externalIdentifiers`,
`sourceValidFrom/To`, `sourceNotes` (Fußnoten), Historiennotiz. Die Pipeline prüft das nach der
Transformation (`source-metadata-transformed`, `source-url-rewritten`).

Nicht umgeschrieben, sondern gemeldet („Unresolved source-specific references“, je Norm im
Report `data/audits/recht-nrw/<slug>.json`, Felder `path`, `term`, `context`, `category`,
`manualDecisionRequired`): Regionen (Rheinland, Westfalen, Ruhrgebiet …), Landschaftsverbände,
Regierungsbezirke/Bezirksregierungen, Kommunen, Landesämter/Landesbetriebe, Ministeriumsnamen,
Flüsse, „Landtag Nordrhein-Westfalen“. Slugs sind deterministisch aus der transformierten
Abkürzung (`vwvfg-west`), sonst Kurzbezeichnung/Titel (`verfassung-fuer-das-land-westdeutschland`);
Kollisionen erhalten die Term-ID.

## 5. Textintegrität

`integrity.ts`: Stufe Fetch→Parse vergleicht Kennzahlen des Roh-HTML (Zahl der §/Artikel-
Überschriften, Tabellen, sichtbarer Textumfang ohne Fußnotentabelle) mit dem geparsten Quellzustand
(Toleranz Textumfang −12 %/+24 %); Stufe Source→Canonical verlangt identische Einheiten,
Blöcke, Tabellen, Anlagen, Fußnotenblöcke und Einheitenfolge sowie Textumfang ±3 %; doppelte
Einheitenkennzeichen sind in beiden Stufen ein Fehler.

## 6. Validierungskorpus (12 Vorschriften)

| Slug | Quelle | Stichtagsfassung | Format | Grund |
| --- | --- | --- | --- | --- |
| `verfassung-fuer-das-land-westdeutschland` | Verfassung für das Land NRW | 14.07.2020 – 15.01.2026 | nativ | verfassungsnah, Artikel, Teile/Abschnitte, 46 Fußnoten, Unterschriftentabelle |
| `go-west` | Gemeindeordnung (GO NRW) | 01.01.2023 – 30.12.2023 | legacy | großes Gesetz (§§ 1–135, 45 Fassungen), Folgefassung 30 Tage nach Stichtag, viele Behörden-/Regionalbezüge |
| `vwvfg-west` | VwVfG NRW | 05.05.2023 – 31.12.2024 | legacy | viele Paragraphen und Untergliederungen, mehrstufige Listen, Abkürzung mit `NRW` |
| `baugb-ag-west` | BauGB-AG NRW | 12.09.2023 – 31.08.2026 | nativ | Ausführungsgesetz zu Bundesrecht (§ 35 BauGB), Vorspann/Schlussformel-Felder |
| `lbtg-west` | Landesbetreuungsgesetz | 01.01.2023 – 29.12.2023 | legacy | Folgefassung kurz nach dem Stichtag, Bundesrechtsverweise (BGB, BtOG) |
| `oepnvg-west` | ÖPNVG NRW | 01.01.2020 – 15.12.2023 | legacy | Versionsauswahl-Test (Einstieg über Fassung 16.12.2023), Inhaltsübersicht als Tabelle |
| `abgg-west` | AbgG NRW | 01.07.2023 – 31.01.2024 | legacy | 26 historische Fassungen, drei nicht darstellbar, Fußnotentabelle |
| `loeg-west` | LÖG NRW | 30.03.2018 – offen | nativ | Stichtagsfassung deutlich früher begonnen, Nummern-/Buchstabenlisten |
| `kibiz-west` | KiBiz | 01.08.2022 – 31.07.2026 (Override) | nativ | Anlage als HTM mit Tabellen, Teile/Kapitel, widersprüchliches „Gültig bis“ der Quelle |
| `verordnung-ueber-umzugskostenentschaedigung-tagegelder-und-entschaedigung` | Umzugskosten-VO (Landesregierung) | 27.07.2013 – offen | nativ | Rechtsverordnung, seit 2013 unverändert |
| `dvo-kibiz-west` | DVO KiBiz | 27.04.2021 – offen | nativ | Rechtsverordnung mit Kurzbezeichnung und Abkürzung in Klammern |
| `schulg-west` | SchulG NRW | 09.03.2022 – 06.06.2025 | legacy | sehr großes Gesetz (§§ 1–133), Belastungstest für Parser, Projektion und Suche |

Verworfen: Hebammengebührenordnung NRW (letzte Fassung endete 16.07.2015 → korrekt „keine Fassung
am Stichtag“); Gebührenordnung Vermessungswesen (Fassung endete 2020).

Rationale je Eintrag: `data/imports/recht-nrw/sample-corpus.json`.

## 7. Bedienung

```sh
npm run import:recht-nrw:inspect -- --url <fassungs-url>   # Metadaten, Fassungsliste, Stichtagsauswahl
npm run import:recht-nrw -- --url <fassungs-url>           # Dry-run des vollständigen Importpfads
npm run import:recht-nrw -- --url <fassungs-url> --write   # schreibt Rohquellen, content/, Report, Manifest
npm run import:recht-nrw:sample                            # Korpus als Dry-run
npm run import:recht-nrw:sample -- --write                 # Korpus schreiben
npm run import:recht-nrw:audit                             # Manifest, Hashes, Dateien, Reports prüfen
```

Optionen: `--offline` (nur Cache), `--cache-dir <pfad>`, `--baseline <datum>`, `--json` (inspect).
Nach einem Schreiblauf: `npm run content:check`, `npm run d1:schema:check`, `npm run test`,
`npm run d1:seed:dev` und Sichtprüfung unter `/west/`, `/west/norm/<slug>/`,
`/west/norm/<slug>/version/2023-12-01/`, `/west/norm/<slug>/quellen/`.

## 8. Bundesrechtsverweise

Der Parser extrahiert noch keine Verweise auf Bundesrecht (z. B. „§ 35 BauGB“, „§ 1819 BGB“).
Die Provider-/Resolver-Architektur (`packages/providers`, `LegalReference`) ist dafür vorbereitet;
eine Erkennung allein über Textmuster wäre riskant (Abkürzungskollisionen, Landesgesetze mit
gleichen Kürzeln). Folgeschritt: kuratierte Abkürzungsliste des Bundesrechts + Extraktion je
Einheit + Prüfung, bevor Links erzeugt werden.

## 9. Verwaltungsvorschriften (bewusst vertagt)

Verwaltungsvorschriften des Landes Nordrhein-Westfalen gehören zum langfristigen Zielbestand,
werden aber nicht über diesen LRGV-Importer in den Stichtagsbestand übernommen. RECHT.NRW führt
sie im Bereich LRMB (`/lrmb/verwaltungsvorschrift/…`, historisches Ministerialblatt). Dafür ist ein
eigener Importpfad zu untersuchen; LRGV und LRMB werden im jetzigen Importer nicht vermischt
(`isImportableLrgvType` lässt nur `gesetz` und `rechtsverordnung` zu).

## 10. Bekannte Grenzen

- PDF-Anlagen werden nur als Quelle registriert, nicht als Text übernommen (Warnung).
- Inline-Auszeichnung (Fett/Kursiv), Links und Sonderzeichen-Positionen werden nicht übernommen (Text bleibt vollständig).
- Fußnotennummern des nativen Formats werden dokumentweit fortlaufend vergeben (RECHT.NRW zeigt sie ohne Nummer je Einheit).
- „Nicht darstellbare“ Altfassungen sind nur relevant, wenn sie die Stichtagsfassung wären (dann Abbruch).
