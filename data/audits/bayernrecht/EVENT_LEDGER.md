# Ereignisregister Bayern (Post-Baseline)

Erzeugt von `npm run import:bayernrecht:events -- --write`. Schema `bayernrecht-event-ledger/1`.
Stichtag **2023-12-01**; als Ereignis „nach dem Stichtag“ zählt ein **Verkündungsdatum** ab **2023-12-02**.
Auswertungsstichtag **2026-09-18** (Konstante, kein Tagesdatum – ein Wiederholungslauf erzeugt denselben Bericht).

Das Register enthält ausschließlich Belege aus den amtlichen Verkündungsorganen des Freistaats Bayern.
Es erzeugt keinen Normtext und entscheidet nicht über die Geltung einer Vorschrift; es liefert die Belege,
aus denen eine spätere Stichtagsprüfung entscheidet.

## 1 Provenienzrang

| Organ | Amtlichkeit | benutzte digitale Form |
| --- | --- | --- |
| Bayerisches Ministerialblatt (BayMBl.) | **amtlich in elektronischer Form** (`electronic-official`) | `official-electronic-edition` |
| Bayerisches Gesetz- und Verordnungsblatt (GVBl.) | **amtlich ist die Druckausgabe** (`printed-official`) | `official-platform-informational-copy` |

Die elektronische GVBl.-Fassung der Verkündungsplattform ist nach den Nutzungshinweisen des Freistaats
ausdrücklich **nachrichtlich**; amtlich ist allein die Papierausgabe. Jedes GVBl.-Ereignis trägt diesen Rang
in `publicationAuthority` und `digitalRepresentation` mit. Nirgends wird behauptet, die digitale Kopie sei
die amtliche Fassung.

## 2 Quellen

Übersichtsseiten: **65** (Ausgabenverzeichnisse und Trefferlisten), je mit Adresse, Abrufzeit und SHA-256 in `data/imports/bayernrecht/events/ledger.json`.
Einzelverkündungen mit Volltext: **1243**; deren Adresse und SHA-256 stehen an jedem Ereignis (`sourceUrl`, `sourceSha256`).

Ausgaben des GVBl. mit der **von der Plattform selbst veröffentlichten** SHA-256 der PDF-Ausgabe: **92**.
Diese Prüfsumme ist der Integritätsbeleg der amtlichen Ausgabe, ohne dass die Ausgabe geladen werden musste.

| Ausgabe | verkündet | Seiten | SHA-256 (Plattformangabe, Anfang) |
| --- | --- | --- | --- |
| 2026/17 | 2026-09-15 | 581 - 588 | `5f58e33750d2a1a739eb…` |
| 2026/16 | 2026-08-31 | 573 - 580 | `75695eb44fd66f6caa34…` |
| 2026/15 | 2026-08-14 | 549 - 572 | `efddee8e10ba34262f61…` |
| 2026/14 | 2026-07-30 | 373 - 548 | `30491d69e157105dbb3d…` |
| 2026/13 | 2026-07-15 | 329 - 372 | `81a82537f2552c795cd8…` |
| 2026/12 | 2026-06-30 | 305 - 328 | `8d66ecab5ac636872b73…` |
| 2026/11 | 2026-06-15 | 281 - 304 | `e4f7464440ae98e536e9…` |
| 2026/10 | 2026-05-29 | 265 - 280 | `7aa5ab9e96dbd647d707…` |
| 2026/09 | 2026-05-15 | 205 - 264 | `3312b6cfacc1a05dd4a2…` |
| 2026/08 | 2026-04-30 | 189 - 204 | `965ad778324d9348bc1b…` |
| 2026/07 | 2026-04-15 | 173 - 188 | `549b4d326219616d9046…` |
| 2026/06 | 2026-03-31 | 73 - 172 | `473708eb06b42d6947e7…` |

Abgleichbestand (nur gelesen): `data/imports/bayernrecht/enumeration-landesrecht.json` (935 Einträge), `data/imports/bayernrecht/enumeration-vwv.json` (1478 Einträge).

Netzabrufe dieses Laufs: **0**, aus dem Cache bedient: **1308**.

## 3 Ereignisse

Verarbeitete Veröffentlichungen im Zeitraum: **2121** (GVBl. und BayMBl. zusammen).
Ereignisse gesamt: **3064** – GVBl. 908, BayMBl. 2156.

| Ereignistyp | 2023 | 2024 | 2025 | 2026 | gesamt |
| --- | --- | --- | --- | --- | --- |
| `new` | 22 | 233 | 129 | 100 | 484 |
| `amend` | 36 | 439 | 387 | 263 | 1125 |
| `repeal` | 0 | 301 | 55 | 173 | 529 |
| `recast` | 0 | 1 | 1 | 0 | 2 |
| `expire` | 6 | 21 | 20 | 10 | 57 |
| `commencement` | 0 | 0 | 1 | 2 | 3 |
| `correction` | 2 | 8 | 14 | 6 | 30 |
| `treaty` | 0 | 7 | 8 | 2 | 17 |
| `notice` | 34 | 315 | 267 | 195 | 811 |
| `unknown` | 0 | 2 | 2 | 2 | 6 |

Nicht aufgetreten: `replace`, `extend`.
Die bayerischen Quellen drücken die Ablösung einer Vorschrift durch eine neue nicht als eigenen Typ aus, sondern
als Aufhebung oder Außerkrafttreten durch den Nachfolger (Subtyp `ausserkrafttreten-durch-nachfolger`, **101** Ereignisse).
Die Typen bleiben im Schema, damit ein späterer Lauf sie führen kann, ohne das Schema zu ändern.

| Subtyp | Anzahl |
| --- | --- |
| `aenderungsgesetz` | 63 |
| `aenderungsverordnung` | 276 |
| `ausserkrafttreten-durch-nachfolger` | 101 |
| `berichtigung` | 30 |
| `inkrafttretensbekanntmachung` | 3 |
| `mantelaenderung` | 199 |
| `neubekanntmachung` | 3 |
| `staatsvertrag` | 17 |
| `teilaufhebung` | 22 |
| `teilausserkrafttreten` | 3 |

## 4 Evidenz, Zielauflösung, Verarbeitungsstand

| Beweisklasse | Anzahl |
| --- | --- |
| `strong` | 1728 |
| `supporting` | 1330 |
| `insufficient` | 6 |
| `contradictory` | 0 |

| Zielauflösung | Anzahl |
| --- | --- |
| `absent-from-portal` | 547 |
| `ambiguous` | 33 |
| `missing-predecessor` | 11 |
| `not-applicable` | 1111 |
| `resolved` | 1320 |
| `unidentified` | 42 |

Ziele mit **strukturell starker** Zuordnung (Gliederungsnummer, Fundstelle im Änderungsverlauf, eindeutige Abkürzung oder vollständiger Titel): **1731**.
Ein bloß ähnlicher Titel trägt nie eine starke Zuordnung – das ist die bindende Regel dieses Registers.

| Verarbeitungsstand | Anzahl |
| --- | --- |
| `missing-predecessor` | 11 |
| `needs-review` | 33 |
| `recorded` | 3014 |
| `unparsed` | 6 |

## 5 Baseline-only-Kandidaten

Ein Ende der **ganzen** Vorschrift (Aufhebung, Ersetzung, Ablauf) mit Verkündung zwischen
2023-12-02 und 2026-09-18, dessen Vorgänger im heutigen Portalbestand **nicht** mehr geführt wird.
Die Vorschrift galt damit am Stichtag und fehlt heute – genau diese Vorschriften muss ein späterer Import
zusätzlich beschaffen. Das ist der wichtigste Vollständigkeitsnachweis dieses Registers.

Anzahl: **426**.

| verkündet | Typ | Ziel | Gl.-Nr. | Merkmale | Fundstelle |
| --- | --- | --- | --- | --- | --- |
| 2024-01-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Teilnahme minderjähriger  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 39 |
| 2024-01-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ausnahmen von der Höchsta | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 39 |
| 2024-01-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Schülerbriefe im internat | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 39 |
| 2024-01-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Förderung von Investition | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 39 |
| 2024-01-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Landesbeauftragte für den | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 39 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Geschäftsverteilung im Au | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über die Empf | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Reform der  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Lehrplan für die Hauptsch | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „KIDZ Kinder | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Vollzug der Volksschulord | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Prüfervergütungen und Ver | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ausschreibung von GribS ( | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Flexible Gr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 56 |
| 2024-01-31 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Gelenkklass | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 56 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Elternbeiräte an schulvor | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Erziehung und Förderung h | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen der Kultusmi | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Orientierungshilfen zur E | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zum Fördersc | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Beratung zur konduktiven  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlungen zu Erziehung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-07 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Multimedia  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 62 |
| 2024-02-15 | `repeal` | Landesfamilienkassenverordnung | 600-16-F | bayrs, abbreviation, exact-title, ausfertigungsdatum, fundstelle | GVBl. 2024 S. 33 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über das Meld | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Nachweis von Kenntnissen  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Richtlinien für die Organ | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Langfristige Sommerferien | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Modellversuch „Islamische | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ferienordnung und schulfr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ferienordnung und schulfr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 120 |
| 2024-03-06 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ferienordnung und schulfr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 120 |
| 2024-03-13 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Empfehlung zur Behandlung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 132 |
| 2024-03-13 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Berufliche Orientierung a | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 132 |
| 2024-03-13 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus, Wissenschaft und Kunst über die D | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 132 |
| 2024-04-03 | `repeal` | Bekanntmachung über den Bußgeldkatalog „Coronavirus-Einreiseverordnung | 2126-G | exact-title | BayMBl. 2024 Nr. 161 |
| 2024-04-03 | `repeal` | Allgemeinverfügung Testnachweis“ | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 161 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über die Aner | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Vollzug der Schulordnunge | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Richtlinien für das Beruf | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Vollzug der Fachakademieo | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch zur Erprobun | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Berufsschul | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über das Kooperationsmodell Haupts | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Gesamtvertrag zur Vergütu | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Schu | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-17 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Zust | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 182 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Schulärztliche Bescheinig | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stärkung der Eigenverantw | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stärkung der Eigenverantw | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stärkung der Eigenverantw | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stärkung der Eigenverantw | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über Innovationen im Schuljahr 200 | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über Innovationen im Schuljahr 200 | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über Teilnehmende Schulen am Schul | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Digi | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 189 |
| 2024-04-24 | `repeal` | Bekanntmachung über die Aufbewahrung, Verwertung und Vernichtung sichergestellter oder beschlagnahmter oder ei | 3121-0-J | exact-title | BayMBl. 2024 Nr. 191 |
| 2024-04-24 | `repeal` | Vernichtung sichergestellter oder beschlagnahmter oder eingezogener explosionsgefährlicher Stoffe | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 191 |
| 2024-05-15 | `repeal` | Bekanntmachung über die Führung des Schiffsregisters und des Schiffsbauregisters | 3155-J | exact-title | BayMBl. 2024 Nr. 226 |
| 2024-05-15 | `repeal` | Schiffsregisters und des Schiffsbauregisters | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 226 |
| 2024-05-15 | `repeal` | Bekanntmachung | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 226 |
| 2024-05-15 | `repeal` | Bekanntmachung über die Beratungshilfe für Bürger mit geringem Einkommen | 3034-J | exact-title | BayMBl. 2024 Nr. 229 |
| 2024-05-15 | `repeal` | Beratungshilfe für Bürger mit geringem Einkommen | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 229 |
| 2024-05-22 | `repeal` | Obersten Baubehörde im Bayerischen Staatsministerium des Innern | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 230 |
| 2024-05-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Infrastruktur, Verkehr und Technologie über  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 234 |
| 2024-05-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Infrastruktur, Verkehr und Technologie über  | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 234 |
| 2024-05-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Infrastruktur, Verkehr und Technologie über  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 234 |
| 2024-05-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft und Verkehr über die Bestimmung der Rechnungs | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 234 |
| 2024-05-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Verkehr und Technologie: Öffentliches Auftra | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 234 |
| 2024-05-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Landesentwicklung und Energie über die Einst | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 234 |
| 2024-05-31 | `expire` | Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-05-31 | `expire` | Berufsfachschulordnung Fremdsprachenberufe; hier: Zeugnismuster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-05-31 | `expire` | Berufsfachschulordnung Gesundheit; hier: Zeugnismuster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-05-31 | `expire` | Wirtschaftsschulordnung (WSO); hier: Zeugnismuster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-05-31 | `expire` | Zeugnismuster, Urkunden | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-05-31 | `expire` | Berufsoberschulen; hier: Zeugnismuster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-05-31 | `expire` | Fachhochschulreife; hier: Zeugnismuster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 257 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Telemedienkon | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Telemedienkon | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über das Telemedienkon | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über das Telemedienkon | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über das Konzept der 3 | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über das Konzept der P | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Telemedienkon | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Telemedienkon | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Veröffentlich | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Veröffentlich | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Tele | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Verö | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Verö | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Tele | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Tele | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Verö | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Satzung der Stiftung Reg | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hör | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hör | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hör | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Veröffentlichung der Hör | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über das Telemedienkonzept des Ba | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über das Telemedienkonzept der AR | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 262 |
| 2024-06-05 | `repeal` | Verwaltungsvorschriften zum Jugendgerichtsgesetz | 3122-2-2-J | exact-title | BayMBl. 2024 Nr. 265 |
| 2024-06-05 | `repeal` | Jugendgerichtsgesetz | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 265 |
| 2024-06-26 | `repeal` | Bayerischen Landesamts für Schule | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 292 |
| 2024-06-26 | `repeal` | Gemeinsame Bekanntmachung der Bayerischen Staatsministerien des Innern, für Unterricht und Kultus und für Arbe | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Dienstanweisung für de | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der H | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der H | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über den Entgeltschutz in der Heimar | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über den Entgeltschutz in der Heimar | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit, Familie und Sozialordnung über die Entgeltüberwachung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über den Vollzug | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Soziales, Familie und Integration über den Vollzug | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Soziales, Familie und Integration über das Bildung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 297 |
| 2024-06-26 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Aufrechterhaltung  | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 297 |
| 2024-06-28 | `repeal` | Bestattungsverordnung | – | exact-title, ausfertigungsdatum, fundstelle | GVBl. 2024 S. 160 |
| 2024-07-10 | `expire` | Freistaates Bayern im Haushaltsjahr 2023 | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 324 |
| 2024-08-07 | `repeal` | Bayerischen Staatsministeriums der Finanzen | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 362 |
| 2024-08-28 | `repeal` | Bekanntmachung über die Mitwirkung der Staatsanwaltschaft in Verfahren nach dem Verschollenheitsgesetz | 3156-J | exact-title | BayMBl. 2024 Nr. 394 |
| 2024-08-28 | `repeal` | Verschollenheitsgesetz | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 394 |
| 2024-08-28 | `repeal` | Bekanntmachung über die Änderung der Bezeichnung der Aus- und Fortbildungsstätte Pegnitz | 2038-3-3-1-J | exact-title | BayMBl. 2024 Nr. 395 |
| 2024-08-28 | `repeal` | Fortbildungsstätte Pegnitz | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 395 |
| 2024-08-28 | `repeal` | Verwaltungsvorschrift betreffend Büchereien der Justizbehörden (ohne Gefangenenbüchereien) | 3003-1-J | exact-title | BayMBl. 2024 Nr. 396 |
| 2024-08-28 | `repeal` | Justiz betreffend Büchereien der Justizbehörden | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 396 |
| 2024-09-11 | `repeal` | Bekanntmachung über die Landwirtschaftliche Betriebsberatung der selbständigen Vollzugsanstalten durch die zus | 3122-2-0-J | exact-title | BayMBl. 2024 Nr. 414 |
| 2024-09-11 | `repeal` | Landwirtschaftliche Betriebsberatung der selbständigen Vollzugsanstalten durch die zuständigen Landwirtschafts | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 414 |
| 2024-10-09 | `repeal` | Arbeitssicherheit und Gesundheitsschutz bei staatlichen Hochbaumaßnahmen; Arbeitshilfe | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Regelmäßige Prüfung der elektrischen Anlagen, der Blitzschutz- und Antennenanlagen in staatseigenen und vom St | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Richtlinien für die Benutzung der Bundesfernstraßen in der Baulast des Bundes (Nutzungsrichtlinien) | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verwendung von Holz bei öffentlichen Bauten | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verwendung von Holz bei öffentlichen Bauten | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verzicht auf die Verwendung tropischer Hölzer bei Baumaßnahmen der öffentlichen Hand | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Holz einheimischer Bauten als umweltfreundlicher Baustoff | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Einführung neuer Vertragsunterlagen; Fortschreibung VHF Bayern; Vergabe Freiberuflicher Leistungen im Bereich  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vierte und fünfte Verordnung zur Änderung der Verordnung über die Vergabe öffentlicher Aufträge (Vergabeverord | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vollzug der Gebührenordnung für Prüfämter und Prüfingenieure (GebOP) bzw. der SachverständigenverordnungBau (S | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vollzug der Gebührenordnung für Prüfämter und Prüfingenieure (GebOP) bzw. der SachverständigenverordnungBau (S | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Genehmigung der „Richtlinien des Landesverbandes bayerischer Kleingärtner e. V. für die Bewertung von Anpflanz | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vollzug des Wohngeldgesetzes (WoGG) | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Wohngeld; Vollzugshinweise | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Wohngeld | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vollzug des Wohngeldgesetzes (WoGG) | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vollzug des Wohngeldgesetzes (WoGG) | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vollzug des Wohngeldgesetzes (WoGG) | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Technische Lieferbedingungen für Streustoffe des Straßenwinterdienstes, Ausgabe 2003 (TL Streu) | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Anweisung zur Kostenermittlung und zur Veranschlagung von Straßenbaumaßnahmen, Ausgabe 2014 Fortschreibung, St | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Allgemeines Rundschreiben Straßenbau (ARS) Nr. 13/2004 Sachgebiet 05.2: Brücken- und Ingenieurbau; Grundlagen  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Richtlinien für das Aufstellen von Bauwerksentwürfen (RAB-ING), Ausgabe 2016, Einführungshinweise | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vertragsangelegenheiten im Straßen- und Brückenbau; Überwachung der Gewährleistungsfristen | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Richtlinien für den Lärmschutz an Straßen – RLS-90 | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Zusätzliche Technische Vertragsbedingungen und Richtlinien für die Ausführung von Lärmschutzwänden an Straßen  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Empfehlungen für die Gestaltung von Lärmschutzanlagen an Straßen – Ausgabe 2005 | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Technische Lieferbedingungen für Bauprodukte zur Herstellung von Pflasterdecken, Plattenbelägen und Einfassung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Leistungsbeschreibung für den Straßen- und Brückenbau in Bayern (LB StB-By 07) | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Zusätzliche Technische Vertragsbedingungen für die Verwertung von Asphaltgranulat im Straßenbau in Bayern, ZTV | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Jahresausschreibungen (Jahresverträge/Rahmenverträge) | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Neue Norm DIN EN 12591, Anforderungen an Straßenbaubitumen; Erweiterte Kontrollprüfungen | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Richtlinien für Lichtsignalanlagen (RiLSA), DIN EN 12368 „Signalleuchten“ und DIN 67527 | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Vergütung für Vorträge bei Aus- und Fortbildungsveranstaltungen im Bereich der Staatsbauverwaltung; Anhebung d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Umbenennung der Dienststelle Bauleitung Maisach der Autobahndirektion Südbayern in Dienststelle München der Au | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Organisation der staatlichen Behörden für das Bau- und Wohnungswesen (OrgBauWoV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauWoV); Übertr | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bauwesen (OrgBauV); Übertrag | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Verordnung über die Einrichtung und Organisation der staatlichen Behörden für das Bau- und Wohnungswesen (OrgB | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-09 | `repeal` | Aktualisierung der ADV-Richtlinien von 1994; IuK-Rahmenrichtlinien der Staatsbauverwaltung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 467 |
| 2024-10-30 | `expire` | Hochschulen mit ausbildungsintegrierendem dualen Bachelorstudiengang“ | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 497 |
| 2024-11-27 | `repeal` | Dienstkleidungsvorschrift für die Bayerische Forstverwaltung | 7900-L | exact-title | BayMBl. 2024 Nr. 565 |
| 2024-11-27 | `repeal` | Bayerische Forstverwaltung vom 27. November 2017, Az. F6-0547.1-1/85 | – | exact-title, fundstelle | BayMBl. 2024 Nr. 565 |
| 2024-11-27 | `repeal` | Gemeinsamen Bekanntmachung über Zuständige Stellen zum Vollzug des Gesetzes zum vorsorgenden Schutz der Bevölk | 7511-U | exact-title | BayMBl. 2024 Nr. 568 |
| 2024-11-27 | `repeal` | Bevölkerung gegen Strahlenbelastung | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 568 |
| 2024-11-29 | `repeal` | Rechtsdienstleistungszuständigkeitsverordnung | 303-2-4-J | bayrs, abbreviation, exact-title, ausfertigungsdatum, fundstelle | GVBl. 2024 S. 563 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Vollzugsrichtlinie | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie über di | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur Gew | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Soziales, Familie und Integration über die Ri | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Richtlinie zur För | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 595 |
| 2024-12-04 | `repeal` | Gemeinsamen Bekanntmachung über den Vollzug des Bundesberggesetzes und der Wassergesetze | 7531-U | exact-title | BayMBl. 2024 Nr. 600 |
| 2024-12-04 | `repeal` | Bundesberggesetzes und der Wassergesetze | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 600 |
| 2024-12-04 | `repeal` | Bayerischen Justizvollzugsschule Straubing | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 605 |
| 2024-12-11 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Feri | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 611 |
| 2024-12-11 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Würd | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 611 |
| 2024-12-11 | `repeal` | Staatsanwaltschaften in dessen Geschäftsbereich | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 615 |
| 2024-12-11 | `repeal` | Bekanntmachung des Staatsministeriums für Gesundheit, Ernährung und Verbraucherschutz über die Gegenseitige Be | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 620 |
| 2024-12-11 | `repeal` | Bekanntmachung des Staatsministeriums für Arbeit und Sozialordnung über die Richtlinien für die Stellenpläne b | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 620 |
| 2024-12-11 | `repeal` | Bekanntmachung des Staatsministeriums für Gesundheit, Pflege und Prävention über die Ehrungen für Verdienste u | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 620 |
| 2024-12-11 | `repeal` | Schreiben des Staatsministeriums für Umwelt und Gesundheit über die Schuleingangsuntersuchung: Technische Verf | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 620 |
| 2024-12-18 | `repeal` | Datenübertragungsregeln für Datenübermittlung und Datenträgeraustausch aus den bei den Amtsgerichten geführten | 3101-J | exact-title | BayMBl. 2024 Nr. 626 |
| 2024-12-18 | `repeal` | Amtsgerichten geführten Schuldnerverzeichnissen | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 626 |
| 2024-12-18 | `repeal` | Rundfunk- und Medienrat-Bekanntmachung | 2251-S | exact-title | BayMBl. 2024 Nr. 641 |
| 2024-12-18 | `repeal` | Medienrat-Bekanntmachung | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 641 |
| 2024-12-18 | `repeal` | Richtlinien über die internationale Fahndung nach Personen, insbesondere der Fahndung nach Personen im Schenge | 3121-0-J | exact-title | BayMBl. 2024 Nr. 649 |
| 2024-12-18 | `repeal` | Personen im Schengener Informationssystem (SIS) und auf Grund eines Europäischen Haftbefehls | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 649 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen über das Verbot der Annahme von Belohnungen ode | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen über den Vollzug der Bayerischen Beihilfeverord | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Voll | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen über Sammelheizung aus dienstlichen Versorgungs | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen über Sammelheizung aus dienstlichen Versorgungs | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über Sammelhe | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über Sammelhe | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über Sammelhe | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen über die Anforderung von Bewerbererklärungen be | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums der Finanzen über die Energieeinsparung im öffentlichen Bere | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Teilnahme von Staatsbediensteten an Veranst | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Arbeitsgelegenheiten (so genannte „Ein-Euro | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug der Bayerischen Beihilfeverordnung  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Lehrneben | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Diskriminierungsfreie Besoldung teilzeitbes | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Vererblic | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Ausgleich | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Besoldung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des BayBesG; hier: Art. 31 Abs. 2 B | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Anwendung | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Ausgleich | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Vollzug des Tarifvertrages f | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Vollzug des Tarifvertrages f | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Tarifvertrages für den öffentli | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Tarifabschluss für die Beschäftigten in for | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Entgeltrunde Forst; Vollzug der Änderungsta | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Vollzug des Tarifvertrages ü | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über das Gesetz üb | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über Vertragsmuster für Arbeitsverträge mit Ärztinne | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug der Änderungstarifverträge Nrn. 5 z | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Arbeitsbe | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Duale Studiengänge (Studium  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Hinweise zu den Änderungen des Bayerischen  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Neue E-Mail-Richtlinie der Bayerischen Verm | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Allgemeinen Grundsätze für die Organisation | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Gewährung und Rückforderung von Straßenunte | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Verteilung der Kraftfahrzeugsteuer; Erfassu | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Förderung von Gemeindestraßenbauvorhaben na | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen zu Art. 10 FAG; Zuweisungsfähige Stundensätze für fr | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Straßenunterhaltungszuschüsse nach Art. 13b | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Förderung des Raum | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Zuwendungen an kommunale Körperschaften nac | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Raumprogramme für  | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Förderung von Bauk | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Lose-Blatt-Sammlung „Haushal | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug der Anlage 3 zu den VV zu Art. 79 B | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Zahlungsaufschub für Einfuhrumsatzsteuer; A | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über das Gesetz über Teilzeitarbeit und befristete A | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über das Gesetz über Teilzeitarbeit und befristete A | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Arbeitsgelegenheiten (so genannte "Ein-Euro | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Hinweise zur Beschaffung von | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2024-12-18 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Krankenhausfinanzierungsgesetze | – | exact-title, ausfertigungsdatum | BayMBl. 2024 Nr. 651 |
| 2025-01-29 | `expire` | Wanderwegen und von Unterkunftshäusern | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 42 |
| 2025-02-05 | `repeal` | Bekanntmachung über die Eignungsprüfung 2015 für das Studium eines Sportstudiengangs an den Hochschulen in Bay | 2210-2-WK | exact-title | BayMBl. 2025 Nr. 52 |
| 2025-02-05 | `repeal` | Hochschulen in Bayern | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 52 |
| 2025-02-19 | `expire` | Bayerischen Staatsministeriums für Wohnen, Bau und Verkehr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 87 |
| 2025-03-12 | `repeal` | Richtlinien für die staatliche Förderung der Betreuung bei der Existenzgründung und Betriebsübernahme in der V | 7071-W | exact-title | BayMBl. 2025 Nr. 113 |
| 2025-03-19 | `repeal` | Alltagskompetenzen – Schule fürs Leben“ an kommunalen Schulen und an privaten Ersatzschulen | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 127 |
| 2025-05-28 | `repeal` | Landeshauptstadt München | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 219 |
| 2025-05-28 | `repeal` | Landeshauptstadt München | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 219 |
| 2025-06-25 | `repeal` | Beruflichen Oberschule Friedberg, Staatliche Fachoberschule und Berufsoberschule | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 268 |
| 2025-06-25 | `repeal` | Beruflichen Oberschule Friedberg, Staatliche Fachoberschule und Berufsoberschule | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 268 |
| 2025-08-13 | `repeal` | Bekanntmachung über die Dienstordnung für die Staatlichen Naturwissenschaftlichen Sammlungen Bayerns mit Natur | 2211-WK | exact-title | BayMBl. 2025 Nr. 324 |
| 2025-08-13 | `repeal` | Staatlichen Naturwissenschaftlichen Sammlungen Bayerns mit Naturkundemuseum Bayern | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 324 |
| 2025-08-13 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die Re | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 328 |
| 2025-08-13 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über den Vo | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 328 |
| 2025-08-13 | `repeal` | Vollzugshinweise zu § 6 Gesetz über den Ladenschluss (Abgabe von Alkohol als Reisebedarf an Tankstellen) | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 328 |
| 2025-08-13 | `repeal` | Vollzugshinweise zum „Gesetz über den Ladenschluß“, Schreiben des Bayerischen Staatsministeriums für Familie,  | – | exact-title, ausfertigungsdatum | BayMBl. 2025 Nr. 328 |
| 2025-10-15 | `repeal` | Erziehungshilfe gegen Straffälligkeit (Jugendgerichtshilfe) und Gewalt | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 421 |
| 2025-11-19 | `repeal` | Bekanntmachung über die Einführung der elektronischen Aktenführung in der Arbeits- und Sozialgerichtsbarkeit | 320-A | exact-title | BayMBl. 2025 Nr. 479 |
| 2025-11-19 | `repeal` | Bekanntmachung über die Einführung der elektronischen Aktenführung in der Arbeits- und Sozialgerichtsbarkeit | 330-A | exact-title | BayMBl. 2025 Nr. 479 |
| 2025-11-19 | `repeal` | Arbeits- und Sozialgerichtsbarkeit | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 479 |
| 2025-11-19 | `expire` | Bayerischen Staatsministeriums für Wohnen, Bau und Verkehr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 480 |
| 2025-12-23 | `repeal` | Abdrucken von Gerichtskostenstemplern | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 574 |
| 2025-12-23 | `expire` | Veröffentlichung im Bayerischen Ministerialblatt | – | exact-title | BayMBl. 2025 Nr. 585 |
| 2025-12-30 | `repeal` | Rückforderungsrichtlinie | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2025 Nr. 590 |
| 2026-01-28 | `repeal` | Bekanntmachung über die Elektronische Aktenführung bei den Gerichten der ordentlichen Gerichtsbarkeit und Staa | 310-J | exact-title | BayMBl. 2026 Nr. 26 |
| 2026-01-28 | `repeal` | Gerichten der ordentlichen Gerichtsbarkeit und Staatsanwaltschaften | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 26 |
| 2026-02-18 | `repeal` | Bekanntmachung über die Ausgestaltung der Jahrgangsstufe 5 an allen weiterführenden Schulen als Gelenkklasse i | 2230-1-1-1-0-K | exact-title | BayMBl. 2026 Nr. 60 |
| 2026-02-18 | `repeal` | Jahrgangsstufe 5 an allen weiterführenden Schulen als Gelenkklasse in der Übertrittsphase | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 60 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Kommunalwahlen; Inanspruc | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über den Spor | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über die Zusa | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Vollzug der Aussiedlerleh | – | abbreviation, exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über Deutschland im Unterricht | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Förderung von Investition | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über das Verzeichnis und Nachtrags | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Vollzug des Bayerischen E | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Stundentafel der Kurzform | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Latein/Fran | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Regelungen für das Fach M | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Hilfsmittel bei Leistungs | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über 50 Jahre Deutsch-Französische | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Medienbildung. Medienerzi | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Erwerb von Latein- bzw. G | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 201 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die An | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 204 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über Muster | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 204 |
| 2026-05-20 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales über die Leistung des Richt | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 204 |
| 2026-05-27 | `expire` | Bayerischen Staatsministeriums der Finanzen | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 206 |
| 2026-05-27 | `expire` | Haushaltsjahren 2024 und 2025 | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 214 |
| 2026-06-17 | `repeal` | Rahmenbeschlusses 2006/960/JI des Rates | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 242 |
| 2026-06-24 | `repeal` | Die Gemeinsame Bekanntmachung der Bayerischen Staatsministerien der Finanzen und des Innern über die Gemeinsam | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Vollzug des Tarifvertrages f | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Vollzug des Tarifvertrages f | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Geltungsbereich des TV-L für Personen in Ma | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Altersteilzeit für Tarifbesc | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Überleitung von Beschäftigten in Altersteil | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Überleitung von Beschäftigten in Altersteil | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat zum Tarifvertrag z | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Personaldurchschnittskosten und Personalvol | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Personald | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Personald | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Personald | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Personald | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Personaldurchschnittskosten  | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Zuweisung | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Vollzug des Art. 10 BayFAG;  | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Kommunale Hochbauförderung n | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen und für Heimat über die Kommunale Hochbauförderung n | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen zu Art. 10 FAG; Förderung des Sportstättenbaus; Qual | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Investitionsförderung kommunaler Kinderbetr | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Städtebauliche Ver | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Kommunale Hochbauförderung nach Art. 10 FAG | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen zu Art. 10 FAG; Erteilung von Unbedenklichkeitsbesch | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Förderung von Inve | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Zuweisungen zum Ba | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Förderrechtliche B | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Förderung des Spor | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über die Verzinsung wegen vorzeitiger Inanspruchnahm | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Schulaufsichtliche | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Mehrfachförderunge | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Ausweitung des För | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen über den Vollzug des Art. 10 FAG; Förderrechtliche H | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über die Kommunale | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-06-24 | `repeal` | Schreiben des Bayerischen Staatsministeriums der Finanzen, für Landesentwicklung und Heimat über den Vollzug d | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 254 |
| 2026-07-01 | `expire` | Hilfsmittelbekanntmachung GV | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 260 |
| 2026-07-01 | `expire` | Bekanntmachung | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 260 |
| 2026-07-08 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über Ausnahmen vom | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 269 |
| 2026-07-08 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über den Dienstaus | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 269 |
| 2026-07-08 | `repeal` | Bekanntmachung über den Vollzug des Bundeszentralregistergesetzes | 3127-I | exact-title | BayMBl. 2026 Nr. 282 |
| 2026-07-15 | `repeal` | Bekanntmachung über Verkehrsüberwachung | 9212-I | exact-title | BayMBl. 2026 Nr. 287 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern über die Regenwassernutzung im Haushalt; Hinweise | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Landesamts für Statistik über die Allgemeinen Gemeinde- und Landkreiswahlen am  | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern über die Reform der Kommunalverwaltungen; Experim | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern über Aufstellung und Vollzug der Haushaltspläne d | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern, für Bau und Verkehr über das Muster für Konzessi | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern, für Bau und Verkehr über Aufstellung und Vollzug | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern über Hinweise zur Verordnung über den Sühneversuc | 2026-4-I | bayrs, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums des Innern über die Anheftung der Terminsbestimmung im Zwang | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 290 |
| 2026-07-15 | `repeal` | Schreiben des Bayerischen Staatsministeriums des Innern über die Anwendung des Vergaberechts bei kommunalen Gr | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 290 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Unfallverhütung an staatl | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Gefährlichkeit der Tollwu | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Unterrichtsbefreiung für  | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Berücksichtigung der Arbe | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über die Führ | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Kollegtage für die Teilne | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über Bundesweite Bildungsstandards | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Kostenersatz und Zuschuss | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ausführungsbestimmungen z | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Anwendung der Dienstordnu | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Regelungen für die kombin | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Gemeinsame Bekanntmachung der Bayerischen Staatsministerien für Unterricht und Kultus, für Umwelt und Gesundhe | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Modellversuch „Regelungen | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Regelungen  | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Mode | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Anfo | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über das Seminar an der Fachobersc | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 294 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Landwirtschaft und Forsten über die Verleihung des Landw | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Entschädi | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Landwirtschaft und Forsten über die Vollstreckung von Ge | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Ausführun | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Sicherung | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Dienstord | – | abbreviation, exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über das Arbeitsge | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Rechtsste | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Aufwandsv | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 295 |
| 2026-07-22 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten über die Aufbewahr | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 295 |
| 2026-07-29 | `expire` | Klimaschutz in Kommunen“ im Bayerischen Klimaschutzprogramm | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 303 |
| 2026-07-29 | `repeal` | Bekanntmachung über das Widerspruchsrecht gemäß Art. 17a Abs. 1 Satz 5 des Bayerischen Krebsregistergesetzes | 2126-8-0-G | exact-title | BayMBl. 2026 Nr. 316 |
| 2026-07-29 | `repeal` | Bayerischen Krebsregistergesetzes | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 316 |
| 2026-07-29 | `repeal` | Bekanntmachung über den Vollzug der Verordnung über die Zuständigkeit zur Verpflichtung im Brand- und Katastro | 453-I | exact-title | BayMBl. 2026 Nr. 317 |
| 2026-08-05 | `repeal` | Bekanntmachung über die Schulgesundheitspflege | 2126-1-G | exact-title | BayMBl. 2026 Nr. 323 |
| 2026-08-05 | `repeal` | Kultus über die Schulgesundheitspflege | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 323 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Grundsätze für die Inven | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Unterricht, Kultus, Wissenschaft und Kunst über die Allg | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Bestimmungen  | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über den Vollzug des B | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Bestimmung vo | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über den Vollzug der V | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Richtlinien d | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Erhebung von  | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Rich | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 328 |
| 2026-08-12 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Richtlinien f | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 328 |
| 2026-09-09 | `repeal` | Bekanntmachung über das Sachverständigenwesen | 3003-8-J | exact-title | BayMBl. 2026 Nr. 369 |
| 2026-09-09 | `repeal` | Justiz über das Sachverständigenwesen | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 369 |
| 2026-09-16 | `repeal` | Europamedaillen-Bekanntmachung – EuMedBek | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 377 |
| 2026-09-16 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die Ve | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 379 |
| 2026-09-16 | `repeal` | Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die Ge | – | exact-title, ausfertigungsdatum, fundstelle | BayMBl. 2026 Nr. 379 |
| 2026-09-16 | `repeal` | Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die Grundsä | – | exact-title, ausfertigungsdatum | BayMBl. 2026 Nr. 379 |
| 2026-09-16 | `repeal` | Verkehr vom 30. Oktober 2023, Az. 49-4384-2-1-7 | – | exact-title, fundstelle | BayMBl. 2026 Nr. 380 |

Zusätzlich **28** Vorschriften mit einem erst nach dem 2026-09-18 wirkenden Ende (künftige Befristung).
Auch sie galten am Stichtag; sie gelten aber weiterhin und sind deshalb keine baseline-only-Kandidaten.

Nicht gezählt sind **25** Teilaufhebungen und Teilaußerkrafttreten nach dem Stichtag
(„§ 7 der Verordnung X wird aufgehoben“). Sie beweisen das Gegenteil eines Endes: Die Vorschrift bestand
im Übrigen fort und galt damit auch am Stichtag.

## 6 Vollständigkeit der Enden

Zu jedem `repeal`, `replace` und `expire` gehört entweder ein bestimmter Vorgänger oder ein ausdrücklicher
Reviewfall. Kein Ereignis verschwindet, und keines wird stillschweigend verworfen.

| Ende-Ereignisse | Anzahl |
| --- | --- |
| gesamt | 586 |
| Vorgänger im Bestand wiedergefunden (`resolved`) | 131 |
| Vorgänger benannt, heute nicht mehr im Bestand (`absent-from-portal`) | 436 |
| mehrdeutig (`ambiguous`, Review) | 8 |
| ohne bestimmbaren Vorgänger (`missing-predecessor`, Review) | 11 |

Reviewfälle `missing-predecessor`: **11**.

| verkündet | Typ | Titel der Veröffentlichung | Fundstelle |
| --- | --- | --- | --- |
| 2024-06-26 | `repeal` | Aufhebung von Verwaltungsvorschriften | BayMBl. 2024 Nr. 295 |
| 2024-09-11 | `repeal` | Aufhebung der Allgemeinen Verfügung des Reichsministeriums der Justiz vom 31. Mai 1935 zur Bestimmung der zust | BayMBl. 2024 Nr. 415 |
| 2024-09-25 | `repeal` | Hinweis auf die Verordnungen zur Änderung der Ausführungsverordnung zum Bayerischen Hochschulinnovationsgesetz | BayMBl. 2024 Nr. 441 |
| 2024-11-13 | `repeal` | Aufhebung von Verwaltungsvorschriften | BayMBl. 2024 Nr. 529 |
| 2024-12-04 | `repeal` | Aufhebung der Dienstvereinbarung über die Einführung, Anwendung und erhebliche Änderungen des Personal- und St | BayMBl. 2024 Nr. 605 |
| 2024-12-11 | `repeal` | Aufhebung der Bekanntmachung über die Dienstvereinbarung über die Einführung, Anwendung und erhebliche Änderun | BayMBl. 2024 Nr. 615 |
| 2026-03-04 | `repeal` | Vollzug der Richtlinie (EU) 2023/977 des Europäischen Parlaments und des Rates vom 10. Mai 2023 über den Infor | BayMBl. 2026 Nr. 89 |
| 2026-06-17 | `repeal` | Aufhebung der Bekanntmachung über den Vollzug der Richtlinie (EU) 2023/977 des Europäischen Parlaments und des | BayMBl. 2026 Nr. 242 |
| 2026-07-08 | `repeal` | Aufhebung von Verwaltungsvorschriften | BayMBl. 2026 Nr. 281 |
| 2026-07-08 | `repeal` | Aufhebung von Verwaltungsvorschriften | BayMBl. 2026 Nr. 283 |
| 2026-07-08 | `repeal` | Aufhebung von Verwaltungsvorschriften | BayMBl. 2026 Nr. 283 |

Mehrdeutige Ziele insgesamt: **33** (Mantelakte und gleichnamige Vorschriften; keine automatische Entscheidung).

## 7 Nicht zugeordnete Veröffentlichungen

Ohne Textebene (nur PDF, kein OCR): **0**. Ohne getroffenes Muster (`unknown`): **6**.
Beide bleiben mit Rohtext im Register und sind die Arbeitsliste für eine spätere Verfeinerung.

| Organ | Fundstelle | verkündet | Titel | Grund |
| --- | --- | --- | --- | --- |
| GVBl. | GVBl. 2024 S. 110 | 2024-06-14 | Entschädigung und Kostenpauschale für die Mitglieder des Bayerischen Landtags | Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt. |
| BayMBl. | BayMBl. 2024 Nr. 477 | 2024-10-16 | Justizstatistik in Zivilsachen, Familiensachen, Straf- und Bußgeldverfahren sowie in Ermit | Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt. |
| GVBl. | GVBl. 2025 S. 118 | 2025-04-30 | Entschädigung und Kostenpauschale für die Mitglieder des Bayerischen Landtags | Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt. |
| BayMBl. | BayMBl. 2025 Nr. 341 | 2025-08-27 | Justizstatistik in Zivilsachen, Familiensachen, Straf- und Bußgeldverfahren sowie in Ermit | Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt. |
| GVBl. | GVBl. 2026 S. 277 | 2026-05-29 | Entschädigung und Kostenpauschale für die Mitglieder des Bayerischen Landtags | Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt. |
| BayMBl. | BayMBl. 2026 Nr. 339 | 2026-08-26 | Justizstatistik in Zivilsachen, Familiensachen, Straf- und Bußgeldverfahren sowie in Ermit | Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt. |

## 8 Grenzen

- Der **CSV-Jahreslistenexport des BayMBl.** hängt an einem POST. Ein GET mit allen Formularfeldern liefert nur die Formularseite zurück (geprüft). Er wurde nicht erzwungen; ausgewertet sind die Übersichtsseiten, die denselben Inhalt strukturiert führen.
- Die **Gliederungsnummer einer BayMBl.-Veröffentlichung bezeichnet ein Sachgebiet**, nicht die einzelne Verwaltungsvorschrift; der Fortführungsnachweis zum BayMBl. führt Nummern nur an den Sachgebietsüberschriften. Für Verwaltungsvorschriften trägt die Identität deshalb die Fundstelle im Änderungsverlauf oder der vollständige Titel.
- **Kein OCR.** Eine Veröffentlichung ohne HTML-Textkörper wird als Review geführt, nicht geraten.
- Das Register erfasst BayMBl.-Veröffentlichungen ohne Gliederungsnummer und ohne Normereignis-Muster im Titel (Stellenausschreibungen, Exequaturs, Verleihungen) **nur aus den Listenangaben**. Sie sind als `notice` enthalten, aber ohne Volltext.
- `www.bayerische-staatszeitung.de` (Verlag der GVBl.-Papierausgabe) wurde nicht berührt: ausdrücklicher TDM-Vorbehalt nach § 44b UrhG.

