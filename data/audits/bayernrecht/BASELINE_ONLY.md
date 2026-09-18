# Heute fehlende Stichtagsnormen (baseline-only) – BayWü

Erzeugt von `npm run import:bayernrecht:restore-baseline-only -- --write`. Stichtag **2023-12-01**, Auswertungsstichtag 2026-09-18.
Methode und Grenzen: `docs/BAYWUE_BASELINE_ONLY.md`. Rezepte: `data/imports/bayernrecht/baseline-only/<id>.json`, alle Kandidaten mit Ergebnis: `candidates.json`.

## 1 Kennzahlen

| Kennzahl | Anzahl |
| --- | ---: |
| Kandidaten (`isBaselineOnlyCandidate`) | 426 |
| starke Identität (Registerzuordnung stark, Zitat in der Aufhebung genau belegt, Ende lesbar) | 395 |
| Ausgangsverkündung gefunden und als dieselbe Norm belegt | 109 |
| Kette vollständig (Gegenprobe, Änderungen angewandt, Beginn und Ende belegt) | 15 |
| sicher wiederhergestellt | 15 (15 Normen) |
| missing-base | 287 |
| incomplete-chain | 6 |
| contradictory | 4 |
| undetermined | 104 |
| not-at-baseline (belegt) | 5 |
| out-of-scope (belegt) | 5 |
| pending (Quelle nicht erreichbar) | 0 |

## 2 Ergebnis je fehlendem Glied

| Ergebnis | fehlendes Glied | Kandidaten |
| --- | --- | ---: |
| missing-base | `annex-pdf-only` | 14 |
| missing-base | `base-not-found` | 1 |
| missing-base | `base-paper-only` | 131 |
| missing-base | `base-pdf-only` | 2 |
| missing-base | `base-unpublished` | 139 |
| incomplete-chain | `amendment-block-unreadable` | 1 |
| incomplete-chain | `amendment-formula-unsupported` | 1 |
| incomplete-chain | `chain-amtsblatt-unsearchable` | 4 |
| contradictory | `not-a-repeal` | 3 |
| contradictory | `present-in-bestand` | 1 |
| undetermined | `begin-no-commencement-clause` | 40 |
| undetermined | `begin-not-calendar-date` | 2 |
| undetermined | `end-undetermined` | 5 |
| undetermined | `identity-date-missing` | 2 |
| undetermined | `identity-not-strong` | 29 |
| undetermined | `scope-normativity-review` | 22 |
| undetermined | `text-structure-unsupported` | 2 |
| undetermined | `vwvwbek-positivliste` | 2 |
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
| `allmbl-2018-17-1111` | Leistung des Richtereides durch Berufsrichter und Verpflichtung der ehrenamtlichen Richter auf ihr Amt in der  | AllMBl. 2018 S. 1111 | 0 | 2018-12-01 bis 2026-05-31 | BayMBl. 2026 Nr. 204 |
| `baymbl-2019-5` | Seminar an der Fachoberschule und Berufsoberschule | BayMBl. 2019 Nr. 5 | 0 | 2019-02-01 bis 2026-07-31 | BayMBl. 2026 Nr. 294 |
| `baymbl-2020-719` | Einstellung und nachwirkende Regelungen des Staatsbetriebs Geschäftsstelle Zentrum Digitalisierung.Bayern | BayMBl. 2020 Nr. 719 | 0 | 2021-01-01 bis 2024-05-31 | BayMBl. 2024 Nr. 234 |
| `baymbl-2020-765` | Aufrechterhaltung eines Notbetriebs in Kindertageseinrichtungen, Kindertagespflegestellen, Ferientagesbetreuun | BayMBl. 2020 Nr. 765 | 0 | 2020-12-16 bis 2024-06-29 | BayMBl. 2024 Nr. 297 |
| `baymbl-2021-556` | Bußgeldkatalog „Coronavirus-Einreiseverordnung – CoronaEinreiseV und Allgemeinverfügung Testnachweis“ | BayMBl. 2021 Nr. 556 | 0 | 2021-08-11 bis 2024-04-03 | BayMBl. 2024 Nr. 161 |
| `baymbl-2022-739` | Dienstordnung für die Staatlichen Naturwissenschaftlichen Sammlungen Bayerns mit Naturkundemuseum Bayern | BayMBl. 2022 Nr. 739 | 0 | 2023-01-01 bis 2025-07-31 | BayMBl. 2025 Nr. 324 |
| `baymbl-2023-147` | Vollzugsrichtlinie zum Bayerischen Bürger-Härtefallfonds „Bayerischer Energiesperren-Schutzschirm“ | BayMBl. 2023 Nr. 147 | 0 | 2023-04-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-164` | Richtlinien zur Förderung von Grün- und Erholungsanlagen aus Anlass von Gartenschauen, von Wanderwegen und von | BayMBl. 2023 Nr. 164 | 0 | 2023-01-01 bis 2025-01-31 | BayMBl. 2025 Nr. 42 |
| `baymbl-2023-237` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 237 | 0 | 2023-05-18 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-262` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise betroffenen Juge | BayMBl. 2023 Nr. 262 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-263` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 263 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-264` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 264 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-364` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 364 | 0 | 2023-07-27 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-370` | Richtlinie über die Gewährung von Billigkeitsleistungen zur temporären Abdeckung von energie- und inflationsbe | BayMBl. 2023 Nr. 370 | 0 | 2023-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-377` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 377 | 0 | 2023-08-03 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |

## 4 Review-Fälle (Auswahl je fehlendem Glied)

### `amendment-block-unreadable` (incomplete-chain, 1)

- Arbeits- und Sozialgerichtsbarkeit – BayMBl. 2025 Nr. 479 (`baymbl-2023-266`): BayMBl. 2023 Nr. 495 (https://www.verkuendung-bayern.de/baymbl/2023-495/): structure-unreadable: Einheit 16: Zitat ohne vorangehenden Befehl mit Doppelpunkt

### `amendment-formula-unsupported` (incomplete-chain, 1)

- Rückforderungsrichtlinie – BayMBl. 2025 Nr. 590 (`baymbl-2021-182`): BayMBl. 2022 Nr. 766 (https://www.verkuendung-bayern.de/baymbl/2022-766/): recast: Neufassung; der Alttext steht nicht im Befehl („Nr. 1 wird wie folgt gefasst: „1. Auflagen bei der Auftragsvergabe im Rahmen von Zuwendungen ¹Jeweils Nr. 3 der Allgemeinen Nebenbestimmungen für Zuwendungen zu“)

### `annex-pdf-only` (missing-base, 14)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über das Kooperationsmodell Hauptschule und Wirtschaftsschule – BayMBl. 2024 Nr. 182 (`kwmbl-2010-8-122`): Anlage(n) nur als Datei verlinkt: „Anlage 1“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A001.pdf); „Anlage 2“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A002.pdf); „Anlage 3“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A003.pdf) – Regelungsgehalt der Anlage nicht als Text verfügbar (docs/LEGAL_SCOPE.md, „Text nur als PDF“)
- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Schulversuch „Teilzeitausbildung i – BayMBl. 2024 Nr. 182 (`kwmbl-2016-10-194`): Anlage(n) nur als Datei verlinkt: „Anlage 1: Teilnehmer am Schulversuch „Teilzeitausbildung in der Kinderpflege““ (/files/kwmbl/2016/10/anhang/2230.1.3-K-951-A001_schulver_PDFA.pdf); „Anlage 2: Stundentafel für die Teilzeitausbildung in der Kinderpflege“ (/files/kwmbl/2016/10/anhang/2230.1.3-K-951-A002_schulver_PDFA.pdf) – Regelungsgehalt der Anlage nicht als Text verfügbar (docs/LEGAL_SCOPE.md, „Text nur als PDF“)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stärkung der Eigenverantwortung beruflicher Schulen Sch – BayMBl. 2024 Nr. 189 (`kwmbl-2009-12-226-2`): Anlage(n) nur als Datei verlinkt: „Anlage 1: Qualitätsmanagement an beruflichen Schulen in Bayern“ (/files/kwmbl/2009/12/anhang/2236.1-UK-519-A001.pdf) – Regelungsgehalt der Anlage nicht als Text verfügbar (docs/LEGAL_SCOPE.md, „Text nur als PDF“)
- … 11 weitere in `candidates.json`

### `base-not-found` (missing-base, 1)

- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Veröffentlichung der Hörfunkprogra – BayMBl. 2024 Nr. 262: https://www.verkuendung-bayern.de/amtsblatt/?volume=2017&journal=4: 0 Dokument(e) beginnen auf Seite 77

### `base-paper-only` (missing-base, 131)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Teilnahme minderjähriger Schüler an abendlichen Veranst – BayMBl. 2024 Nr. 39: KWMBl. I S. 133: KWMBl. 1976: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ausnahmen von der Höchstaltersgrenze für Lehrer und Päd – BayMBl. 2024 Nr. 39: KWMBl. I 1981 S. 78: KWMBl. 1981: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Schülerbriefe im internationalen Briefverkehr – BayMBl. 2024 Nr. 39: KWMBl. I S. 35: KWMBl. 2001/2002: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- … 128 weitere in `candidates.json`

### `base-pdf-only` (missing-base, 2)

- Landesfamilienkassenverordnung – GVBl. 2024 S. 33: Keine HTML-Detailseite (https://www.verkuendung-bayern.de/gvbl/2008-410/); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor
- Rechtsdienstleistungszuständigkeitsverordnung – GVBl. 2024 S. 563: Keine HTML-Detailseite (https://www.verkuendung-bayern.de/gvbl/2008-341/); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor

### `base-unpublished` (missing-base, 139)

- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der Heimarbeit; Verbot der Ausgabe  – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2564-5/1/88): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung
- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der Heimarbeit; Klagen nach § 25 de – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2564-2/2/88): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung
- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über den Entgeltschutz in der Heimarbeit; Heimarbeitstätigkeiten,  – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2561-2/4/89): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung
- … 136 weitere in `candidates.json`

### `begin-no-commencement-clause` (undetermined, 40)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Gelenkklasse an einer Grundschule” – BayMBl. 2024 Nr. 56 (`kwmbl-2010-18-332`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Modellversuch „Islamischer Unterricht“ – BayMBl. 2024 Nr. 120 (`kwmbl-2010-4-38`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ferienordnung und schulfreie Samstage für das Schuljahr – BayMBl. 2024 Nr. 120 (`kwmbl-2010-21-520`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- … 37 weitere in `candidates.json`

### `begin-not-calendar-date` (undetermined, 2)

- Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gewährung von Billigkeitsleistung – BayMBl. 2024 Nr. 595 (`baymbl-2023-310`): Inkrafttretensvorschrift ohne Kalenderdatum: „Die Richtlinie tritt mit am 22. Juni 2023 in Kraft; sie tritt mit Ablauf des 31. Dezember 2025 außer Kraft.“ – verkündet ist nicht in Kraft; ein Datum wird nicht errechnet
- Abdrucken von Gerichtskostenstemplern – BayMBl. 2025 Nr. 574 (`jmbl-2012-7-58`): Inkrafttretensvorschrift ohne Kalenderdatum: „Diese Vereinbarung tritt mit dem 1. des Monats in Kraft, der auf den Tag folgt, an dem die letzte unterzeichnete Vereinbarung beim Niedersächsischen Justizministerium eingegangen ist.“ – verkündet ist nicht in Kraft; ein Datum wird nicht errechnet

### `chain-amtsblatt-unsearchable` (incomplete-chain, 4)

- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Zuständigkeit für das Vergabeverfa – BayMBl. 2024 Nr. 182 (`kwmbl-2017-6-91`): Zeitraum 2017-05-23 bis 2018 in den Amtsblättern (ohne Volltextsuche): 669 Veröffentlichungen – mehr als 120 werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus
- Medienrat-Bekanntmachung – BayMBl. 2024 Nr. 641 (`allmbl-2017-1-3`): Zeitraum 2017-01-31 bis 2018 in den Amtsblättern (ohne Volltextsuche): 775 Veröffentlichungen – mehr als 120 werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus
- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Anforderungen in der Prüfung für d – BayMBl. 2026 Nr. 294 (`kwmbl-2016-10-183-2`): Zeitraum 2016-09-13 bis 2018 in den Amtsblättern (ohne Volltextsuche): 928 Veröffentlichungen – mehr als 120 werden nicht vollständig gelesen; die Gliederungsnummern allein schließen Sammeländerungen nicht aus
- … 1 weitere in `candidates.json`

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

### `identity-not-strong` (undetermined, 29)

- Bekanntmachung über den Bußgeldkatalog „Coronavirus-Einreiseverordnung – BayMBl. 2024 Nr. 161: Zuordnung im Ereignisregister nur supporting (exact-title)
- Bekanntmachung über die Aufbewahrung, Verwertung und Vernichtung sichergestellter oder beschlagnahmter oder eingezogener explosionsgefährlic – BayMBl. 2024 Nr. 191: Zuordnung im Ereignisregister nur supporting (exact-title)
- Bekanntmachung über die Führung des Schiffsregisters und des Schiffsbauregisters – BayMBl. 2024 Nr. 226: Zuordnung im Ereignisregister nur supporting (exact-title)
- … 26 weitere in `candidates.json`

### `not-a-repeal` (contradictory, 3)

- Bayerischen Landesamts für Schule – BayMBl. 2024 Nr. 292: Die Verkündung ändert die Norm, sie hebt sie nicht auf: „1. Die Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Aufgaben des Bayerischen Landesamts für Schule vom 1. Oktober 2018 (KWMBl. S. 375) wird wie folgt geändert:“
- Bestattungsverordnung – GVBl. 2024 S. 160: Die Verkündung ändert die Norm, sie hebt sie nicht auf: „Die Verordnung zur Änderung der Bestattungsverordnung vom 21. April 2022 (GVBl. S. 210) wird wie folgt geändert:“
- Bayerischen Staatsministeriums der Finanzen – BayMBl. 2024 Nr. 362: Die Verkündung ändert die Norm, sie hebt sie nicht auf: „Die Hilfsmittelbekanntmachung-Q2 (HMQ2Bek) des Bayerischen Staatsministeriums der Finanzen vom 2. Dezember 2011 (FMBl. S. 398), die zuletzt durch Bekanntmachung vom 10. November 2022 (BayMBl. Nr. 649) geändert worden ist, wird wie folgt geändert:“

### `present-in-bestand` (contradictory, 1)

- Europamedaillen-Bekanntmachung – EuMedBek – BayMBl. 2026 Nr. 377 (`allmbl-2018-15-962`): Der Bestand führt bereits BayVV_1132_S_086 (Bereich vwv, https://www.gesetze-bayern.de/Content/Document/BayVV_1132_S_086, Quellgeltung ab 2018-11-01) mit demselben Titel „Verleihung einer Medaille für besondere Verdienste um den Freistaat Bayern in Europa und der Welt“ – das Register nennt die Norm „heute fehlend“, der Bestand widerspricht

### `scope-normativity-review` (undetermined, 22)

- Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-231`): Prüffall nach docs/LEGAL_SCOPE.md („Zeugnismuster“ im Titel „Vollzug der Schulordnung über die Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster“): Vorschriftencharakter wird nicht automatisch festgestellt
- Berufsfachschulordnung Fremdsprachenberufe; hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-365`): Prüffall nach docs/LEGAL_SCOPE.md („Zeugnismuster“ im Titel „Vollzug der Berufsfachschulordnung Fremdsprachenberufe; hier: Zeugnismuster“): Vorschriftencharakter wird nicht automatisch festgestellt
- Berufsfachschulordnung Gesundheit; hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-575`): Prüffall nach docs/LEGAL_SCOPE.md („Zeugnismuster“ im Titel „Vollzug der Berufsfachschulordnung Gesundheit; hier: Zeugnismuster“): Vorschriftencharakter wird nicht automatisch festgestellt
- … 19 weitere in `candidates.json`

### `scope-not-state-regulation` (out-of-scope, 5)

- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Veröffentlichung der Hörfunkprogramme der L – BayMBl. 2024 Nr. 262 (`kwmbl-2012-17-242`): Erlassstelle „Bekanntmachung des Deutschlandradios“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hörfunkprogramme der Landesrundfu – BayMBl. 2024 Nr. 262 (`baymbl-2020-622`): Erlassstelle „Bekanntmachung des Deutschlandradios“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hörfunkprogramme der Landesrundfu – BayMBl. 2024 Nr. 262 (`baymbl-2021-388`): Erlassstelle „Bekanntmachung des Deutschlandradios“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
- … 2 weitere in `candidates.json`

### `text-structure-unsupported` (undetermined, 2)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Flexible Grundschule” vom 2. August 2010  – BayMBl. 2024 Nr. 56 (`kwmbl-2010-17-266`): https://www.verkuendung-bayern.de/amtsblatt/dokument/kwmbl-2010-17-266/: Element <tr> innerhalb eines Absatzes
- Bekanntmachung des Bayerischen Staatsministeriums des Innern, für Bau und Verkehr über Aufstellung und Vollzug der Haushaltspläne der Kommun – BayMBl. 2026 Nr. 290 (`allmbl-2018-2-200`): https://www.verkuendung-bayern.de/amtsblatt/dokument/allmbl-2018-2-200/: Element <td> in einer Tabelle

### `vwvwbek-positivliste` (undetermined, 2)

- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Digitale Ankündigung von Angeboten – BayMBl. 2024 Nr. 189 (`kwmbl-2013-23-373-2`): Ausgefertigt am 2013-11-18: Nach Nr. 1 VwVWBek (AllMBl. 2016 S. 1555) traten alle bis 31. Dezember 2015 erlassenen veröffentlichten Verwaltungsvorschriften der Staatsregierung, der Staatskanzlei und der Staatsministerien außer Kraft, soweit sie nicht als fortgeltend in BAYERN.RECHT eingestellt waren. Beleg wäre das „Verzeichnis der ab 1. Januar 2016 fortgeltenden veröffentlichten Verwaltungsvorschriften“ (Positivlist
- Vollzugshinweise zu § 6 Gesetz über den Ladenschluss (Abgabe von Alkohol als Reisebedarf an Tankstellen) – BayMBl. 2025 Nr. 328 (`allmbl-2012-13-888`): Ausgefertigt am 2012-11-07: Nach Nr. 1 VwVWBek (AllMBl. 2016 S. 1555) traten alle bis 31. Dezember 2015 erlassenen veröffentlichten Verwaltungsvorschriften der Staatsregierung, der Staatskanzlei und der Staatsministerien außer Kraft, soweit sie nicht als fortgeltend in BAYERN.RECHT eingestellt waren. Beleg wäre das „Verzeichnis der ab 1. Januar 2016 fortgeltenden veröffentlichten Verwaltungsvorschriften“ (Positivlist

## 5 Grenzen

- Ausgangsfassungen vor 2009 (Amtsblätter nur gedruckt), nicht verkündete Schreiben und Blätter außerhalb der Verkündungsplattform bleiben `missing-base`; es gibt keine OCR und keinen Text aus Sekundärquellen.
- Verwaltungsvorschriften, die bis 31. Dezember 2015 erlassen wurden, gelten nach der VwVWBek nur fort, wenn sie in der Positivliste stehen; deren Textlayer ist nicht durchgehend sicher dekodierbar – bis dahin `undetermined` (`vwvwbek-positivliste`).
- Die Kette wird im BayMBl. per Volltextsuche nach Ausfertigungsdatum und Fundstelle gegengeprüft (Gliederungsnummern allein übersehen Sammeländerungen, belegt an BayMBl. 2022 Nr. 766); die Amtsblätter 2009–2018 haben keine Volltextsuche – dort wird jede Veröffentlichung des Zeitraums gelesen, bei mehr als 120 bleibt die Kette `chain-amtsblatt-unsearchable`.
- Änderungen werden nur mit den Wortlautformeln der Rückrechnung angewandt (`reconstruction/formulas.ts`); Neufassungen, Aufhebungen einzelner Glieder, Einfügungen ganzer Glieder und Berichtigungen bleiben `incomplete-chain`.
- Fingerabdrücke gelten dem Quelltext vor der Überleitung; eine Änderung der Überleitung macht kein Rezept ungültig.
