# Heute fehlende Stichtagsnormen (baseline-only) – BayWü

Erzeugt von `npm run import:bayernrecht:restore-baseline-only -- --write`. Stichtag **2023-12-01**, Auswertungsstichtag 2026-09-18.
Methode und Grenzen: `docs/BAYWUE_BASELINE_ONLY.md`. Rezepte: `data/imports/bayernrecht/baseline-only/<id>.json`, alle Kandidaten mit Ergebnis: `candidates.json`.

## 1 Kennzahlen

| Kennzahl | Anzahl |
| --- | ---: |
| Kandidaten (`isBaselineOnlyCandidate`) | 414 |
| starke Identität (Registerzuordnung stark, Zitat in der Aufhebung genau belegt, Ende lesbar) | 405 |
| Ausgangsverkündung gefunden und als dieselbe Norm belegt | 119 |
| Kette vollständig (Gegenprobe, Änderungen angewandt, Beginn und Ende belegt) | 28 |
| sicher wiederhergestellt | 28 (25 Normen) |
| Doppelerfassungen im Register (Ereignis ohne Zitat, mit dem zitierten Ereignis derselben Aufhebung verbunden; übernimmt dessen Ergebnis) | 22 |
| missing-base | 292 |
| incomplete-chain | 24 |
| contradictory | 0 |
| undetermined | 58 |
| not-at-baseline (belegt) | 7 |
| out-of-scope (belegt) | 5 |
| pending (Quelle nicht erreichbar) | 0 |

## 2 Ergebnis je fehlendem Glied

| Ergebnis | fehlendes Glied | Kandidaten |
| --- | --- | ---: |
| missing-base | `annex-pdf-only` | 16 |
| missing-base | `base-paper-only` | 136 |
| missing-base | `base-pdf-only` | 2 |
| missing-base | `base-unpublished` | 138 |
| incomplete-chain | `amendment-formula-unsupported` | 9 |
| incomplete-chain | `chain-amtsblatt-unsearchable` | 14 |
| incomplete-chain | `chain-fulltext-unverified` | 1 |
| undetermined | `begin-no-commencement-clause` | 15 |
| undetermined | `begin-not-calendar-date` | 2 |
| undetermined | `begin-unreadable` | 1 |
| undetermined | `citation-ambiguous` | 1 |
| undetermined | `end-undetermined` | 5 |
| undetermined | `identity-date-missing` | 2 |
| undetermined | `identity-not-strong` | 6 |
| undetermined | `scope-normativity-review` | 24 |
| undetermined | `text-structure-unsupported` | 2 |
| not-at-baseline | `begin-after-baseline` | 2 |
| not-at-baseline | `enacted-after-baseline` | 5 |
| out-of-scope | `scope-not-state-regulation` | 5 |

- `safe`: sicher wiederhergestellt (Rezept)
- `missing-base`: Ausgangsfassung fehlt (Papier, nicht verkündet, nur PDF, Anlage nur als PDF, Bild)
- `incomplete-chain`: Änderungsfolge unvollständig oder nicht anwendbar
- `contradictory`: widersprüchliche Belege
- `undetermined`: unbestimmt (Identität, Beginn, Ende, Weitergeltung, Umfang)
- `not-at-baseline`: belegt: galt am Stichtag nicht
- `out-of-scope`: belegt: keine Vorschrift des Landesrechts
- `pending`: offen: Quelle in diesem Lauf nicht erreichbar

## 3 Sicher wiederhergestellte Normen

| Kennung | Titel | Fundstelle | Änderungen | Quellgeltung | Ende durch |
| --- | --- | --- | ---: | --- | --- |
| `allmbl-2017-5-244` | Bekanntmachung über das Widerspruchsrecht gemäß Art. 17a Abs. 1 Satz 5 des Bayerischen Krebsregistergesetzes | AllMBl. 2017 S. 244 | 0 | 2017-05-15 bis 2026-07-29 | BayMBl. 2026 Nr. 316 |
| `allmbl-2018-17-1111` | Leistung des Richtereides durch Berufsrichter und Verpflichtung der ehrenamtlichen Richter auf ihr Amt in der  | AllMBl. 2018 S. 1111 | 0 | 2018-12-01 bis 2026-05-31 | BayMBl. 2026 Nr. 204 |
| `allmbl-2018-7-403` | Aufbewahrung und Archivierung von Flurbereinigungsunterlagen | AllMBl. 2018 S. 403 | 0 | 2018-06-01 bis 2026-07-01 | BayMBl. 2026 Nr. 295 |
| `baymbl-2019-433` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | BayMBl. 2019 Nr. 433 | 0 | 2020-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 651 |
| `baymbl-2019-5` | Seminar an der Fachoberschule und Berufsoberschule | BayMBl. 2019 Nr. 5 | 0 | 2019-02-01 bis 2026-07-31 | BayMBl. 2026 Nr. 294 |
| `baymbl-2020-36` | Richtlinie zur Förderung von Investitionen zur Schaffung von Betreuungsplätzen für Grundschulkinder | BayMBl. 2020 Nr. 36 | 1 | 2022-08-04 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2020-719` | Einstellung und nachwirkende Regelungen des Staatsbetriebs Geschäftsstelle Zentrum Digitalisierung.Bayern | BayMBl. 2020 Nr. 719 | 0 | 2021-01-01 bis 2024-05-31 | BayMBl. 2024 Nr. 234 |
| `baymbl-2020-765` | Aufrechterhaltung eines Notbetriebs in Kindertageseinrichtungen, Kindertagespflegestellen, Ferientagesbetreuun | BayMBl. 2020 Nr. 765 | 0 | 2020-12-16 bis 2024-06-29 | BayMBl. 2024 Nr. 297 |
| `baymbl-2021-556` | Bußgeldkatalog „Coronavirus-Einreiseverordnung – CoronaEinreiseV und Allgemeinverfügung Testnachweis“ | BayMBl. 2021 Nr. 556 | 0 | 2021-08-11 bis 2024-04-03 | BayMBl. 2024 Nr. 161 |
| `baymbl-2022-739` | Dienstordnung für die Staatlichen Naturwissenschaftlichen Sammlungen Bayerns mit Naturkundemuseum Bayern | BayMBl. 2022 Nr. 739 | 0 | 2023-01-01 bis 2025-07-31 | BayMBl. 2025 Nr. 324 |
| `baymbl-2022-740` | Richtlinien zum Förderschwerpunkt „Klimaschutz in Kommunen“ im Bayerischen Klimaschutzprogramm (Förderrichtlin | BayMBl. 2022 Nr. 740 | 0 | 2023-01-01 bis 2025-09-30 | BayMBl. 2026 Nr. 303 |
| `baymbl-2023-147` | Vollzugsrichtlinie zum Bayerischen Bürger-Härtefallfonds „Bayerischer Energiesperren-Schutzschirm“ | BayMBl. 2023 Nr. 147 | 0 | 2023-04-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-164` | Richtlinien zur Förderung von Grün- und Erholungsanlagen aus Anlass von Gartenschauen, von Wanderwegen und von | BayMBl. 2023 Nr. 164 | 0 | 2023-01-01 bis 2025-01-31 | BayMBl. 2025 Nr. 42 |
| `baymbl-2023-226` | Richtlinien zur Haushalts- und Wirtschaftsführung des Freistaates Bayern im Haushaltsjahr 2023 (Haushaltsvollz | BayMBl. 2023 Nr. 226 | 0 | 2023-01-01 bis 2024-06-27 | BayMBl. 2024 Nr. 324 |
| `baymbl-2023-237` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 237 | 0 | 2023-05-18 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-262` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise betroffenen Juge | BayMBl. 2023 Nr. 262 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-263` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 263 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-264` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 264 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-364` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 364 | 0 | 2023-07-27 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-370` | Richtlinie über die Gewährung von Billigkeitsleistungen zur temporären Abdeckung von energie- und inflationsbe | BayMBl. 2023 Nr. 370 | 0 | 2023-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-377` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 377 | 0 | 2023-08-03 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `fmbl-2015-13-266` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | FMBl. 2015 S. 266 | 0 | 2016-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 651 |
| `fmbl-2017-14-458` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | FMBl. 2017 S. 458 | 0 | 2018-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 651 |
| `fmbl-2017-14-467` | Richtlinie zur Rechnungslegung über Einnahmen und Ausgaben des Freistaates Bayern | FMBl. 2017 S. 467 | 0 | 2017-01-01 bis 2024-12-31 | BayMBl. 2024 Nr. 618 |
| `kwmbl-2017-6-91` | Zuständigkeit für das Vergabeverfahren bei Kooperationsverträgen im Bereich der staatlichen beruflichen Schule | KWMBl. 2017 S. 91 | 0 | 2017-09-01 bis 2024-04-16 | BayMBl. 2024 Nr. 182 |

## 4 Review-Fälle (Auswahl je fehlendem Glied)

### `amendment-formula-unsupported` (incomplete-chain, 9)

- Rundfunk- und Medienrat-Bekanntmachung – BayMBl. 2024 Nr. 641 (`allmbl-2017-1-3`): BayMBl. 2021 Nr. 488 (https://www.verkuendung-bayern.de/baymbl/2021-488/): recast: Neufassung; der Alttext steht nicht im Befehl („Nr. 3 Buchst. c Doppelbuchst. cc wird wie folgt gefasst: „cc) Musik-Organisationen: Bayerischer Musikrat e. V.““)
- Medienrat-Bekanntmachung – BayMBl. 2024 Nr. 641 (`allmbl-2017-1-3`): BayMBl. 2021 Nr. 488 (https://www.verkuendung-bayern.de/baymbl/2021-488/): recast: Neufassung; der Alttext steht nicht im Befehl („Nr. 3 Buchst. c Doppelbuchst. cc wird wie folgt gefasst: „cc) Musik-Organisationen: Bayerischer Musikrat e. V.““)
- Bekanntmachung über die Einführung der elektronischen Aktenführung in der Arbeits- und Sozialgerichtsbarkeit – BayMBl. 2025 Nr. 479 (`baymbl-2023-266`): BayMBl. 2023 Nr. 495 (https://www.verkuendung-bayern.de/baymbl/2023-495/): recast: Neufassung; der Alttext steht nicht im Befehl („Die Nrn. 1.1 bis 1.3 werden wie folgt gefasst: „1.1 Arbeitsgericht München Bei der 14., 20. und 22. Kammer für alle Verfahren, die am 1. Juni 2023 oder später a“)
- … 6 weitere in `candidates.json`

### `annex-pdf-only` (missing-base, 16)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über das Kooperationsmodell Hauptschule und Wirtschaftsschule – BayMBl. 2024 Nr. 182 (`kwmbl-2010-8-122`): Anlage(n) nur als Datei verlinkt: „Anlage 1“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A001.pdf); „Anlage 2“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A002.pdf); „Anlage 3“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A003.pdf) – Regelungsgehalt der Anlage nicht als Text verfügbar (docs/LEGAL_SCOPE.md, „Text nur als PDF“)
- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Schulversuch „Teilzeitausbildung i – BayMBl. 2024 Nr. 182 (`kwmbl-2016-10-194`): Anlage(n) nur als Datei verlinkt: „Anlage 1: Teilnehmer am Schulversuch „Teilzeitausbildung in der Kinderpflege““ (/files/kwmbl/2016/10/anhang/2230.1.3-K-951-A001_schulver_PDFA.pdf); „Anlage 2: Stundentafel für die Teilzeitausbildung in der Kinderpflege“ (/files/kwmbl/2016/10/anhang/2230.1.3-K-951-A002_schulver_PDFA.pdf) – Regelungsgehalt der Anlage nicht als Text verfügbar (docs/LEGAL_SCOPE.md, „Text nur als PDF“)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stärkung der Eigenverantwortung beruflicher Schulen Sch – BayMBl. 2024 Nr. 189 (`kwmbl-2009-12-226-2`): Anlage(n) nur als Datei verlinkt: „Anlage 1: Qualitätsmanagement an beruflichen Schulen in Bayern“ (/files/kwmbl/2009/12/anhang/2236.1-UK-519-A001.pdf) – Regelungsgehalt der Anlage nicht als Text verfügbar (docs/LEGAL_SCOPE.md, „Text nur als PDF“)
- … 13 weitere in `candidates.json`

### `base-paper-only` (missing-base, 136)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Teilnahme minderjähriger Schüler an abendlichen Veranst – BayMBl. 2024 Nr. 39: KWMBl. I S. 133: KWMBl. 1976: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ausnahmen von der Höchstaltersgrenze für Lehrer und Päd – BayMBl. 2024 Nr. 39: KWMBl. I 1981 S. 78: KWMBl. 1981: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Schülerbriefe im internationalen Briefverkehr – BayMBl. 2024 Nr. 39: KWMBl. I S. 35: KWMBl. 2001: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- … 133 weitere in `candidates.json`

### `base-pdf-only` (missing-base, 2)

- Landesfamilienkassenverordnung – GVBl. 2024 S. 33: Keine HTML-Detailseite (https://www.verkuendung-bayern.de/gvbl/2008-410/); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor
- Rechtsdienstleistungszuständigkeitsverordnung – GVBl. 2024 S. 563: Keine HTML-Detailseite (https://www.verkuendung-bayern.de/gvbl/2008-341/); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor

### `base-unpublished` (missing-base, 138)

- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der Heimarbeit; Verbot der Ausgabe  – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2564-5/1/88): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung
- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der Heimarbeit; Klagen nach § 25 de – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2564-2/2/88): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung
- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über den Entgeltschutz in der Heimarbeit; Heimarbeitstätigkeiten,  – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2561-2/4/89): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung
- … 135 weitere in `candidates.json`

### `begin-after-baseline` (not-at-baseline, 2)

- Richtlinien für die staatliche Förderung der Betreuung bei der Existenzgründung und Betriebsübernahme in der Vorgründungsphase (Richtlinie V – BayMBl. 2025 Nr. 113 (`baymbl-2023-580`): Inkrafttreten am 2024-01-01, nach dem Stichtag: „Diese Bekanntmachung tritt am 1. Januar 2024 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.“
- Vorgründungsphase (Richtlinie Vorgründungs- und Nachfolgecoaching)“ – BayMBl. 2025 Nr. 113 (`baymbl-2023-580`): Inkrafttreten am 2024-01-01, nach dem Stichtag: „Diese Bekanntmachung tritt am 1. Januar 2024 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.“

### `begin-no-commencement-clause` (undetermined, 15)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Gelenkklasse an einer Grundschule” – BayMBl. 2024 Nr. 56 (`kwmbl-2010-18-332`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Modellversuch „Islamischer Unterricht“ – BayMBl. 2024 Nr. 120 (`kwmbl-2010-4-38`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ferienordnung und schulfreie Samstage für das Schuljahr – BayMBl. 2024 Nr. 120 (`kwmbl-2010-21-520`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- … 12 weitere in `candidates.json`

### `begin-not-calendar-date` (undetermined, 2)

- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Satzung der Stiftung Regensburger Centrum für Interven – BayMBl. 2024 Nr. 262 (`kwmbl-2018-12-376`): Inkrafttretensvorschrift ohne Kalenderdatum: „Diese Satzung tritt am Tage nach ihrer Verkündung in Kraft.“ – verkündet ist nicht in Kraft; ein Datum wird nicht errechnet
- Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gewährung von Billigkeitsleistung – BayMBl. 2024 Nr. 595 (`baymbl-2023-310`): Inkrafttretensvorschrift ohne Kalenderdatum: „Die Richtlinie tritt mit am 22. Juni 2023 in Kraft; sie tritt mit Ablauf des 31. Dezember 2025 außer Kraft.“ – verkündet ist nicht in Kraft; ein Datum wird nicht errechnet

### `begin-unreadable` (undetermined, 1)

- Abdrucken von Gerichtskostenstemplern – BayMBl. 2025 Nr. 574 (`jmbl-2012-7-58`): Mehrere Inkrafttretensregeln („Diese Bekanntmachung tritt mit Wirkung vom 1. April 2012 in Kraft.“; „Diese Vereinbarung tritt mit dem 1. des Monats in Kraft, der auf den Tag folgt, an dem die letzte unterzeichnete Vereinb“)

### `chain-amtsblatt-unsearchable` (incomplete-chain, 14)

- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Digitale Ankündigung von Angeboten – BayMBl. 2024 Nr. 189 (`kwmbl-2013-23-373-2`): Zeitraum 2013-12-20 bis 2018 in den Amtsblättern (ohne Volltextsuche): mindestens 220 Ausgaben – mehr als 200 Ausgaben werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus
- Bekanntmachung über die Änderung der Bezeichnung der Aus- und Fortbildungsstätte Pegnitz – BayMBl. 2024 Nr. 395 (`jmbl-2014-5-66`): Zeitraum 2014-06-11 bis 2018 in den Amtsblättern (ohne Volltextsuche): mindestens 220 Ausgaben – mehr als 200 Ausgaben werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus
- Fortbildungsstätte Pegnitz – BayMBl. 2024 Nr. 395 (`jmbl-2014-5-66`): Zeitraum 2014-06-11 bis 2018 in den Amtsblättern (ohne Volltextsuche): mindestens 220 Ausgaben – mehr als 200 Ausgaben werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus
- … 11 weitere in `candidates.json`

### `chain-fulltext-unverified` (incomplete-chain, 1)

- Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Soziales, Familie und Integration über die Richtlinie zur Förderung von Inv – BayMBl. 2024 Nr. 595 (`allmbl-2017-8-332`): BayMBl.-Volltextsuche „8. August 2017 AllMBl. S. 332“ (6 Treffer) findet die zitierende(n) Seite(n) https://www.verkuendung-bayern.de/baymbl/2021-19/, https://www.verkuendung-bayern.de/baymbl/2021-649/ nicht – die Suche ist für diese Norm nicht belegt

### `citation-ambiguous` (undetermined, 1)

- Bayerischen Besoldungsgesetzes und weiterer Rechtsvorschriften – GVBl. 2026 S. 208: 2 Zitate mit verschiedener Fundstelle oder Änderungsklausel (Einheiten 286, 287)

### `enacted-after-baseline` (not-at-baseline, 5)

- Bekanntmachung des Staatsministeriums für Gesundheit, Pflege und Prävention über die Ehrungen für Verdienste um Gesundheit, Pflege und Präve – BayMBl. 2024 Nr. 620: Ausgefertigt am 2024-04-22, nach dem Stichtag 2023-12-01
- Alltagskompetenzen – Schule fürs Leben“ an kommunalen Schulen und an privaten Ersatzschulen – BayMBl. 2025 Nr. 127: Ausgefertigt am 2025-02-11, nach dem Stichtag 2023-12-01
- Bayerischen Staatsministeriums für Wohnen, Bau und Verkehr – BayMBl. 2025 Nr. 480: Ausgefertigt am 2024-12-13, nach dem Stichtag 2023-12-01
- … 2 weitere in `candidates.json`

### `end-undetermined` (undetermined, 5)

- Obersten Baubehörde im Bayerischen Staatsministerium des Innern – BayMBl. 2024 Nr. 230: Aufhebende Verkündung ohne lesbare Grundregel zum Inkrafttreten
- Landeshauptstadt München – BayMBl. 2025 Nr. 219: Aufhebende Verkündung ohne lesbare Grundregel zum Inkrafttreten
- Landeshauptstadt München – BayMBl. 2025 Nr. 219: Aufhebende Verkündung ohne lesbare Grundregel zum Inkrafttreten
- … 2 weitere in `candidates.json`

### `identity-date-missing` (undetermined, 2)

- Bayerische Forstverwaltung vom 27. November 2017, Az. F6-0547.1-1/85 – BayMBl. 2024 Nr. 565: Das Register führt kein Ausfertigungsdatum des Zitats; ohne Datum keine Identität
- Verkehr vom 30. Oktober 2023, Az. 49-4384-2-1-7 – BayMBl. 2026 Nr. 380: Das Register führt kein Ausfertigungsdatum des Zitats; ohne Datum keine Identität

### `identity-not-strong` (undetermined, 6)

- Bekanntmachung über die Führung des Schiffsregisters und des Schiffsbauregisters – BayMBl. 2024 Nr. 226: Zuordnung im Ereignisregister nur supporting (exact-title)
- Dienstkleidungsvorschrift für die Bayerische Forstverwaltung – BayMBl. 2024 Nr. 565: Zuordnung im Ereignisregister nur supporting (exact-title)
- Veröffentlichung im Bayerischen Ministerialblatt – BayMBl. 2025 Nr. 585: Zuordnung im Ereignisregister nur supporting (exact-title)
- … 3 weitere in `candidates.json`

### `scope-normativity-review` (undetermined, 24)

- Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-231`): Prüffall nach docs/LEGAL_SCOPE.md („Zeugnismuster“ im Titel „Vollzug der Schulordnung über die Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster“): Vorschriftencharakter wird nicht automatisch festgestellt
- Berufsfachschulordnung Fremdsprachenberufe; hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-365`): Prüffall nach docs/LEGAL_SCOPE.md („Zeugnismuster“ im Titel „Vollzug der Berufsfachschulordnung Fremdsprachenberufe; hier: Zeugnismuster“): Vorschriftencharakter wird nicht automatisch festgestellt
- Berufsfachschulordnung Gesundheit; hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-575`): Prüffall nach docs/LEGAL_SCOPE.md („Zeugnismuster“ im Titel „Vollzug der Berufsfachschulordnung Gesundheit; hier: Zeugnismuster“): Vorschriftencharakter wird nicht automatisch festgestellt
- … 21 weitere in `candidates.json`

### `scope-not-state-regulation` (out-of-scope, 5)

- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Veröffentlichung der Hörfunkprogramme der L – BayMBl. 2024 Nr. 262 (`kwmbl-2012-17-242`): Erlassstelle „Bekanntmachung des Deutschlandradios“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hörfunkprogramme der Landesrundfu – BayMBl. 2024 Nr. 262 (`baymbl-2020-622`): Erlassstelle „Bekanntmachung des Deutschlandradios“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hörfunkprogramme der Landesrundfu – BayMBl. 2024 Nr. 262 (`baymbl-2021-388`): Erlassstelle „Bekanntmachung des Deutschlandradios“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
- … 2 weitere in `candidates.json`

### `text-structure-unsupported` (undetermined, 2)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Flexible Grundschule” vom 2. August 2010  – BayMBl. 2024 Nr. 56 (`kwmbl-2010-17-266`): https://www.verkuendung-bayern.de/amtsblatt/dokument/kwmbl-2010-17-266/: Element <tr> innerhalb eines Absatzes
- Bekanntmachung des Bayerischen Staatsministeriums des Innern, für Bau und Verkehr über Aufstellung und Vollzug der Haushaltspläne der Kommun – BayMBl. 2026 Nr. 290 (`allmbl-2018-2-200`): https://www.verkuendung-bayern.de/amtsblatt/dokument/allmbl-2018-2-200/: Element <td> in einer Tabelle

## 5 Grenzen

- Ausgangsfassungen vor 2009 (Amtsblätter nur gedruckt), nicht verkündete Schreiben und Blätter außerhalb der Verkündungsplattform bleiben `missing-base`; es gibt keine OCR und keinen Text aus Sekundärquellen.
- Verwaltungsvorschriften, die bis 31. Dezember 2015 erlassen wurden, gelten nach der VwVWBek nur fort, wenn sie in der Positivliste stehen (Textlayer vollständig zerlegt, kein OCR). Nicht gelistet heißt: galt am Stichtag nicht (`vwvwbek-not-listed`); vor 2016 geändert (Fassungsdatum ≠ Erlassdatum) bleibt `vwvwbek-amended-before-2016`.
- Die Kette wird im BayMBl. per Volltextsuche nach Ausfertigungsdatum und Fundstelle gegengeprüft (Gliederungsnummern allein übersehen Sammeländerungen, belegt an BayMBl. 2022 Nr. 766); die Amtsblätter 2009–2018 haben keine Volltextsuche – dort wird jede Veröffentlichung des Zeitraums gelesen, höchstens 200 Ausgaben je Norm – Verwaltungsvorschriften, die vor Herbst 2015 verkündet wurden, bleiben deshalb `chain-amtsblatt-unsearchable`.
- Änderungen werden nur mit den Wortlautformeln der Rückrechnung angewandt (`reconstruction/formulas.ts`); Neufassungen, Aufhebungen einzelner Glieder, Einfügungen ganzer Glieder und Berichtigungen bleiben `incomplete-chain`.
- Fingerabdrücke gelten dem Quelltext vor der Überleitung; eine Änderung der Überleitung macht kein Rezept ungültig.
