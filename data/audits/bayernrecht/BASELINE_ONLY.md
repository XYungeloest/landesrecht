# Heute fehlende Stichtagsnormen (baseline-only) – BayWü

Erzeugt von `npm run import:bayernrecht:restore-baseline-only -- --write`. Stichtag **2023-12-01**, Auswertungsstichtag 2026-09-18.
Methode und Grenzen: `docs/BAYWUE_BASELINE_ONLY.md`. Rezepte: `data/imports/bayernrecht/baseline-only/<id>.json`, alle Kandidaten mit Ergebnis: `candidates.json`.

## 1 Kennzahlen

| Kennzahl | Anzahl |
| --- | ---: |
| Kandidaten (`isBaselineOnlyCandidate`) | 438 |
| starke Identität (Registerzuordnung stark, Zitat in der Aufhebung genau belegt, Ende lesbar) | 432 |
| Ausgangsverkündung gefunden und als dieselbe Norm belegt | 141 |
| Kette vollständig (Gegenprobe, Änderungen angewandt, Beginn und Ende belegt) | 72 |
| sicher wiederhergestellt | 72 (61 Normen) |
| Doppelerfassungen im Register (Ereignis ohne Zitat, mit dem zitierten Ereignis derselben Aufhebung verbunden; übernimmt dessen Ergebnis) | 23 |
| missing-base | 295 |
| incomplete-chain | 6 |
| contradictory | 0 |
| undetermined | 32 |
| not-at-baseline (belegt) | 12 |
| out-of-scope (belegt) | 21 |
| pending (Quelle nicht erreichbar) | 0 |

## 2 Ergebnis je fehlendem Glied

| Ergebnis | fehlendes Glied | Kandidaten |
| --- | --- | ---: |
| missing-base | `annex-pdf-only` | 17 |
| missing-base | `base-paper-only` | 140 |
| missing-base | `base-pdf-only` | 2 |
| missing-base | `base-unpublished` | 136 |
| incomplete-chain | `amendment-block-unreadable` | 1 |
| incomplete-chain | `amendment-formula-unsupported` | 1 |
| incomplete-chain | `amendment-target-unresolved` | 1 |
| incomplete-chain | `chain-correction` | 2 |
| incomplete-chain | `chain-fulltext-unverified` | 1 |
| undetermined | `begin-no-commencement-clause` | 16 |
| undetermined | `begin-unreadable` | 1 |
| undetermined | `citation-ambiguous` | 1 |
| undetermined | `end-undetermined` | 3 |
| undetermined | `identity-not-strong` | 5 |
| undetermined | `scope-normativity-review` | 3 |
| undetermined | `text-structure-unsupported` | 3 |
| not-at-baseline | `begin-after-baseline` | 2 |
| not-at-baseline | `enacted-after-baseline` | 10 |
| out-of-scope | `scope-not-state-regulation` | 1 |
| out-of-scope | `scope-publication-notice` | 20 |

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
| `allmbl-2010-13-408-2` | Schulgesundheitspflege | AllMBl. 2010 S. 408 | 0 | 2011-01-01 bis 2026-08-05 | BayMBl. 2026 Nr. 323 |
| `allmbl-2012-13-888` | Vollzugshinweise zu § 6 Gesetz über den Ladenschluss (Abgabe von Alkohol als Reisebedarf an Tankstellen) | AllMBl. 2012 S. 888 | 0 | 2012-11-07 bis 2025-08-12 | BayMBl. 2025 Nr. 328 |
| `allmbl-2013-5-181` | Stiftung eines Staatspreises für vorbildliche Waldbewirtschaftung | AllMBl. 2013 S. 181 | 0 | 2013-05-01 bis 2024-09-30 | BayMBl. 2024 Nr. 447 |
| `allmbl-2014-11-487` | Ehrung für Verdienste um Gesundheit und Pflege | AllMBl. 2014 S. 487 | 0 | 2014-11-01 bis 2024-05-14 | BayMBl. 2024 Nr. 211 |
| `allmbl-2015-8-403` | Ehrungen für Verdienste um die Umwelt | AllMBl. 2015 S. 403 | 0 | 2015-09-01 bis 2023-12-31 | BayMBl. 2024 Nr. 24 |
| `allmbl-2017-1-3` | Wahlen zum Rundfunkrat und Medienrat | AllMBl. 2017 S. 3 | 2 | 2021-11-01 bis 2024-12-30 | BayMBl. 2024 Nr. 641 |
| `allmbl-2017-12-571-3` | Dienstkleidungsvorschrift für die Bayerische Forstverwaltung | AllMBl. 2017 S. 571 | 0 | 2018-01-01 bis 2024-12-31 | BayMBl. 2024 Nr. 565 |
| `allmbl-2017-5-244` | Bekanntmachung über das Widerspruchsrecht gemäß Art. 17a Abs. 1 Satz 5 des Bayerischen Krebsregistergesetzes | AllMBl. 2017 S. 244 | 0 | 2017-05-15 bis 2026-07-29 | BayMBl. 2026 Nr. 316 |
| `allmbl-2017-8-332` | Richtlinie zur Förderung von Investitionen im Rahmen des Investitionsprogramms „Kinderbetreuungsfinanzierung“  | AllMBl. 2017 S. 332 | 4 | 2023-06-30 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `allmbl-2018-17-1111` | Leistung des Richtereides durch Berufsrichter und Verpflichtung der ehrenamtlichen Richter auf ihr Amt in der  | AllMBl. 2018 S. 1111 | 0 | 2018-12-01 bis 2026-05-31 | BayMBl. 2026 Nr. 204 |
| `allmbl-2018-7-403` | Aufbewahrung und Archivierung von Flurbereinigungsunterlagen | AllMBl. 2018 S. 403 | 0 | 2018-06-01 bis 2026-07-01 | BayMBl. 2026 Nr. 295 |
| `baymbl-2019-433` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | BayMBl. 2019 Nr. 433 | 0 | 2020-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 651 |
| `baymbl-2019-5` | Seminar an der Fachoberschule und Berufsoberschule | BayMBl. 2019 Nr. 5 | 0 | 2019-02-01 bis 2026-07-31 | BayMBl. 2026 Nr. 294 |
| `baymbl-2020-119` | Elektronische Aktenführung bei den Gerichten der ordentlichen Gerichtsbarkeit und Staatsanwaltschaften | BayMBl. 2020 Nr. 119 | 16 | 2023-11-13 bis 2024-01-21 | BayMBl. 2026 Nr. 26 |
| `baymbl-2020-36` | Richtlinie zur Förderung von Investitionen zur Schaffung von Betreuungsplätzen für Grundschulkinder | BayMBl. 2020 Nr. 36 | 1 | 2022-08-04 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2020-719` | Einstellung und nachwirkende Regelungen des Staatsbetriebs Geschäftsstelle Zentrum Digitalisierung.Bayern | BayMBl. 2020 Nr. 719 | 0 | 2021-01-01 bis 2024-05-31 | BayMBl. 2024 Nr. 234 |
| `baymbl-2020-765` | Aufrechterhaltung eines Notbetriebs in Kindertageseinrichtungen, Kindertagespflegestellen, Ferientagesbetreuun | BayMBl. 2020 Nr. 765 | 0 | 2020-12-16 bis 2024-06-29 | BayMBl. 2024 Nr. 297 |
| `baymbl-2020-86` | Gebundene Ganztagsangebote an Schulen | BayMBl. 2020 Nr. 86 | 1 | 2021-03-26 bis 2026-02-28 | BayMBl. 2026 Nr. 48 |
| `baymbl-2021-182` | Richtlinie zur Rückforderung von Zuwendungen bei schweren Vergabeverstößen | BayMBl. 2021 Nr. 182 | 1 | 2023-01-01 bis 2023-12-31 | BayMBl. 2025 Nr. 590 |
| `baymbl-2021-556` | Bußgeldkatalog „Coronavirus-Einreiseverordnung – CoronaEinreiseV und Allgemeinverfügung Testnachweis“ | BayMBl. 2021 Nr. 556 | 0 | 2021-08-11 bis 2024-04-03 | BayMBl. 2024 Nr. 161 |
| `baymbl-2021-562` | Regelungen und Richtlinien für die Berechnung und Bemessung von Ingenieurbauten (BEM-ING) – Teil 3 „Berechnung | BayMBl. 2021 Nr. 562 | 0 | 2021-11-15 bis 2024-10-31 | BayMBl. 2024 Nr. 483 |
| `baymbl-2021-64` | Vollzug der Bauvorlagenverordnung | BayMBl. 2021 Nr. 64 | 0 | 2021-02-01 bis 2024-02-29 | BayMBl. 2024 Nr. 61 |
| `baymbl-2022-231` | Vollzug der Schulordnung über die Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster | BayMBl. 2022 Nr. 231 | 0 | 2022-04-13 bis 2024-05-30 | BayMBl. 2024 Nr. 257 |
| `baymbl-2022-317` | Vollzug der Schulordnung für die Berufliche Oberschule – Fachoberschulen und Berufsoberschulen; hier: Zeugnism | BayMBl. 2022 Nr. 317 | 0 | 2022-05-25 bis 2024-05-30 | BayMBl. 2024 Nr. 257 |
| `baymbl-2022-365` | Vollzug der Berufsfachschulordnung Fremdsprachenberufe; hier: Zeugnismuster | BayMBl. 2022 Nr. 365 | 0 | 2022-06-15 bis 2024-05-30 | BayMBl. 2024 Nr. 257 |
| `baymbl-2022-367` | Vollzug der Fachschulordnung und der Fachakademieordnung; hier: Zeugnismuster, Urkunden | BayMBl. 2022 Nr. 367 | 0 | 2022-06-15 bis 2024-05-30 | BayMBl. 2024 Nr. 257 |
| `baymbl-2022-392` | Vollzug der Berufsfachschulordnung (BFSO) und der Wirtschaftsschulordnung (WSO); hier: Zeugnismuster | BayMBl. 2022 Nr. 392 | 0 | 2022-06-29 bis 2024-05-30 | BayMBl. 2024 Nr. 257 |
| `baymbl-2022-5` | Richtlinien zur Förderung von Energiekonzepten und kommunalen Energienutzungsplänen | BayMBl. 2022 Nr. 5 | 0 | 2022-01-01 bis 2023-12-31 | BayMBl. 2024 Nr. 8 |
| `baymbl-2022-567` | Bekanntmachung zur Anpassung der im Kommunal-Wahlbeamten-Gesetz enthaltenen Rahmensätze, Grenz- und Höchstbetr | BayMBl. 2022 Nr. 567 | 0 | 2022-12-01 bis 2024-10-31 | BayMBl. 2024 Nr. 434 |
| `baymbl-2022-574` | Schulversuch „Kombinierte Ausbildung im Erzieherbereich an Fachakademien für Sozialpädagogik und Hochschulen m | BayMBl. 2022 Nr. 574 | 0 | 2022-09-01 bis 2024-10-15 | BayMBl. 2024 Nr. 497 |
| `baymbl-2022-575` | Vollzug der Berufsfachschulordnung Gesundheit; hier: Zeugnismuster | BayMBl. 2022 Nr. 575 | 0 | 2022-10-12 bis 2024-05-30 | BayMBl. 2024 Nr. 257 |
| `baymbl-2022-739` | Dienstordnung für die Staatlichen Naturwissenschaftlichen Sammlungen Bayerns mit Naturkundemuseum Bayern | BayMBl. 2022 Nr. 739 | 0 | 2023-01-01 bis 2025-07-31 | BayMBl. 2025 Nr. 324 |
| `baymbl-2022-740` | Richtlinien zum Förderschwerpunkt „Klimaschutz in Kommunen“ im Bayerischen Klimaschutzprogramm (Förderrichtlin | BayMBl. 2022 Nr. 740 | 0 | 2023-01-01 bis 2025-09-30 | BayMBl. 2026 Nr. 303 |
| `baymbl-2023-147` | Vollzugsrichtlinie zum Bayerischen Bürger-Härtefallfonds „Bayerischer Energiesperren-Schutzschirm“ | BayMBl. 2023 Nr. 147 | 0 | 2023-04-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-164` | Richtlinien zur Förderung von Grün- und Erholungsanlagen aus Anlass von Gartenschauen, von Wanderwegen und von | BayMBl. 2023 Nr. 164 | 0 | 2023-01-01 bis 2025-01-31 | BayMBl. 2025 Nr. 42 |
| `baymbl-2023-226` | Richtlinien zur Haushalts- und Wirtschaftsführung des Freistaates Bayern im Haushaltsjahr 2023 (Haushaltsvollz | BayMBl. 2023 Nr. 226 | 0 | 2023-01-01 bis 2024-06-27 | BayMBl. 2024 Nr. 324 |
| `baymbl-2023-237` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 237 | 0 | 2023-05-18 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-262` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise betroffenen Juge | BayMBl. 2023 Nr. 262 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-263` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 263 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-264` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 264 | 0 | 2023-06-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-266` | Einführung der elektronischen Aktenführung in der Arbeits- und Sozialgerichtsbarkeit | BayMBl. 2023 Nr. 266 | 1 | 2023-11-01 bis 2024-02-29 | BayMBl. 2025 Nr. 479 |
| `baymbl-2023-274` | Richtzeichnungen für Ingenieurbauten (RiZ-ING), Fortschreibung Januar 2022 | BayMBl. 2023 Nr. 274 | 0 | 2023-06-07 bis 2024-10-08 | BayMBl. 2024 Nr. 466 |
| `baymbl-2023-295` | Anbindung von EfA-Diensten | BayMBl. 2023 Nr. 295 | 0 | 2023-06-15 bis 2025-01-14 | BayMBl. 2025 Nr. 7 |
| `baymbl-2023-310` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 310 | 0 | 2023-06-22 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-364` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 364 | 0 | 2023-07-27 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-370` | Richtlinie über die Gewährung von Billigkeitsleistungen zur temporären Abdeckung von energie- und inflationsbe | BayMBl. 2023 Nr. 370 | 0 | 2023-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-377` | Richtlinie zur Gewährung von Billigkeitsleistungen zur Unterstützung der von der Energiekrise in Deutschland b | BayMBl. 2023 Nr. 377 | 0 | 2023-08-03 bis 2024-12-30 | BayMBl. 2024 Nr. 595 |
| `baymbl-2023-415` | Preise für gute Lehre an den staatlichen Hochschulen in Bayern | BayMBl. 2023 Nr. 415 | 0 | 2023-08-15 bis 2026-04-30 | BayMBl. 2026 Nr. 88 |
| `fmbl-2015-13-266` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | FMBl. 2015 S. 266 | 0 | 2016-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 651 |
| `fmbl-2017-14-458` | Bekanntmachung zur Anpassung der in § 9 Abs. 3 der Bayerischen Nebentätigkeitsverordnung enthaltenen Höchstbet | FMBl. 2017 S. 458 | 0 | 2018-01-01 bis 2024-12-30 | BayMBl. 2024 Nr. 651 |
| `fmbl-2017-14-467` | Richtlinie zur Rechnungslegung über Einnahmen und Ausgaben des Freistaates Bayern | FMBl. 2017 S. 467 | 0 | 2017-01-01 bis 2024-12-31 | BayMBl. 2024 Nr. 618 |
| `jmbl-2014-5-66` | Änderung der Bezeichnung der Ausbildungs- und Fortbildungsstätte in Pegnitz | JMBl. 2014 S. 66 | 0 | 2014-07-01 bis 2024-08-31 | BayMBl. 2024 Nr. 395 |
| `kwmbl-2010-10-150` | Regelungen für die kombinierte Ausbildung im Bereich Pflege an Berufsfachschulen und an Fachhochschulen mit au | KWMBl. 2010 S. 150 | 0 | 2009-08-01 bis 2026-07-31 | BayMBl. 2026 Nr. 294 |
| `kwmbl-2010-12-172` | Ausgestaltung der Jahrgangsstufe 5 an allen weiterführenden Schulen als Gelenkklasse in der Übertrittsphase | KWMBl. 2010 S. 172 | 0 | 2010-08-01 bis 2026-07-31 | BayMBl. 2026 Nr. 60 |
| `kwmbl-2011-13-129` | Hilfsmittel bei Leistungsnachweisen an bayerischen Gymnasien, Abendgymnasien und Kollegs im achtjährigen Gymna | KWMBl. 2011 S. 129 | 1 | 2023-09-01 bis 2026-05-19 | BayMBl. 2026 Nr. 201 |
| `kwmbl-2012-20-301` | 50 Jahre Deutsch-Französischer Vertrag | KWMBl. 2012 S. 301 | 0 | 2012-10-01 bis 2026-05-19 | BayMBl. 2026 Nr. 201 |
| `kwmbl-2012-22-357` | Medienbildung. Medienerziehung und informationstechnische Bildung in der Schule | KWMBl. 2012 S. 357 | 0 | 2012-11-01 bis 2026-05-19 | BayMBl. 2026 Nr. 201 |
| `kwmbl-2013-23-373-2` | Digitale Ankündigung von Angeboten für Schülerinnen und Schüler sowie Lehrkräfte aus dem Bereich der „Kulturel | KWMBl. 2013 S. 373 | 0 | 2013-11-07 bis 2024-04-23 | BayMBl. 2024 Nr. 189 |
| `kwmbl-2013-5-69` | Schulversuch „Regelungen für die kombinierte Ausbildung an der Fachakademie für Heilpädagogik Rummelsberg und  | KWMBl. 2013 S. 69 | 1 | 2014-08-01 bis 2026-07-31 | BayMBl. 2026 Nr. 294 |
| `kwmbl-2016-10-183-2` | Anforderungen in der Prüfung für den Hochschulzugang von besonders befähigten Berufstätigen (Begabtenprüfung) | KWMBl. 2016 S. 183 | 1 | 2017-02-14 bis 2026-07-31 | BayMBl. 2026 Nr. 294 |
| `kwmbl-2017-6-91` | Zuständigkeit für das Vergabeverfahren bei Kooperationsverträgen im Bereich der staatlichen beruflichen Schule | KWMBl. 2017 S. 91 | 0 | 2017-09-01 bis 2024-04-16 | BayMBl. 2024 Nr. 182 |

## 4 Review-Fälle (Auswahl je fehlendem Glied)

### `amendment-block-unreadable` (incomplete-chain, 1)

- Bayerischen Staatsministeriums für Wirtschaft, Landesentwicklung und Energie – BayMBl. 2023 Nr. 601 (`baymbl-2019-253`): BayMBl. 2022 Nr. 758 (https://www.verkuendung-bayern.de/baymbl/2022-758/): structure-unreadable: Einheit 6: Zitat ohne vorangehenden Befehl mit Doppelpunkt

### `amendment-formula-unsupported` (incomplete-chain, 1)

- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Schulversuch „Teilzeitausbildung i – BayMBl. 2024 Nr. 182 (`kwmbl-2016-10-194`): KWMBl. 2017 S. 90 (https://www.verkuendung-bayern.de/amtsblatt/dokument/kwmbl-2017-6-90-2/): insert-unit: kein zugelassener Struktur-Befehl: „In Anlage 1 werden nach Spiegelstrich 8 folgende Spiegelstriche 9 und 10 eingefügt: „ –&ensp;Klara-Oppenheimer-Schule, Städtische Berufsfachschule für Kinderpfl“; strukturiert: keine Neufassung („In Anlage 1 werden nach Spiegelstrich 8 folgende Spiegelstriche 9 und 10 eingefügt

### `amendment-target-unresolved` (incomplete-chain, 1)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Modellversuch „Regelungen für die kombinierte Ausbildun – BayMBl. 2026 Nr. 294 (`kwmbl-2012-14-199`): KWMBl. 2018 S. 347 (https://www.verkuendung-bayern.de/amtsblatt/dokument/kwmbl-2018-11-347/): a2-s01: a2-s01: zu ersetzender Wortlaut „zum Wintersemester 2017/2018“ kommt im Bereich 0-mal vor (erwartet: genau einmal)

### `annex-pdf-only` (missing-base, 17)

- Bayerischen Staatsministeriums für Wohnen, Bau und Verkehr – BayMBl. 2024 Nr. 68 (`baymbl-2023-72`): Anlage(n) mit möglichem Regelungsgehalt (weder Vordruck noch Übersicht): „Richtlinien für das Aufstellen von Bauwerksentwürfen für Ingenieurbauten (RAB-IN“ – Anlage(n): „Richtlinien für das Aufstellen von Bauwerksentwürfen für Ingenieurbauten (RAB-IN“ (/files/baymbl/2023/72/anhang/Anlage.pdf)
- Innern und für Wissenschaft, Forschung und Kunst – BayMBl. 2024 Nr. 130 (`allmbl-2012-11-627`): Kopferlass (1072 Zeichen Text neben 1 Anlage(n)) – Anlage(n): „Stoffpläne“ (/files/allmbl/2012/11/anhang/2038.3.2-I-2168-A001_PDF-A1b.pdf)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über das Kooperationsmodell Hauptschule und Wirtschaftsschule – BayMBl. 2024 Nr. 182 (`kwmbl-2010-8-122`): Anlage(n) mit möglichem Regelungsgehalt (weder Vordruck noch Übersicht): „Anlage 1: Kooperierende Schulen des Kooperationsmodells Hauptschule und Wirtscha“; „Anlage 2“; „Anlage 3“ – Anlage(n): „Anlage 1: Kooperierende Schulen des Kooperationsmodells Hauptschule und Wirtscha“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A001.pdf); „Anlage 2“ (/files/kwmbl/2010/08/anhang/2230.1.3-UK-565-A002.pdf); „Anlage 3“ (/files/kw
- … 14 weitere in `candidates.json`

### `base-paper-only` (missing-base, 140)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Teilnahme minderjähriger Schüler an abendlichen Veranst – BayMBl. 2024 Nr. 39: KWMBl. I S. 133: KWMBl. 1976: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ausnahmen von der Höchstaltersgrenze für Lehrer und Päd – BayMBl. 2024 Nr. 39: KWMBl. I 1981 S. 78: KWMBl. 1981: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Schülerbriefe im internationalen Briefverkehr – BayMBl. 2024 Nr. 39: KWMBl. I S. 35: KWMBl. 2001: vor 2009 erschienene Ausgaben gibt es nur gedruckt (Nutzungshinweise zum BayMBl.)
- … 137 weitere in `candidates.json`

### `base-pdf-only` (missing-base, 2)

- Landesfamilienkassenverordnung – GVBl. 2024 S. 33: Keine HTML-Detailseite (https://www.verkuendung-bayern.de/gvbl/2008-410/); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor
- Rechtsdienstleistungszuständigkeitsverordnung – GVBl. 2024 S. 563: Keine HTML-Detailseite (https://www.verkuendung-bayern.de/gvbl/2008-341/); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor

### `base-unpublished` (missing-base, 136)

- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der Heimarbeit; Verbot der Ausgabe  – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2564-5/1/88): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung. Suche in den Inhaltsübersichten: Erlass 1988-01-15 außerhalb der Amtsblätter 2009–2018.
- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über die Entgeltüberwachung in der Heimarbeit; Klagen nach § 25 de – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2564-2/2/88): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung. Suche in den Inhaltsübersichten: Erlass 1988-01-26 außerhalb der Amtsblätter 2009–2018.
- Schreiben des Bayerischen Staatsministeriums für Arbeit und Sozialordnung über den Entgeltschutz in der Heimarbeit; Heimarbeitstätigkeiten,  – BayMBl. 2024 Nr. 297: Zitiert nur mit Aktenzeichen (Az. I 3/2561-2/4/89): ein nicht verkündetes Schreiben – keine amtliche Veröffentlichung der Ausgangsfassung. Suche in den Inhaltsübersichten: Erlass 1989-03-17 außerhalb der Amtsblätter 2009–2018.
- … 133 weitere in `candidates.json`

### `begin-after-baseline` (not-at-baseline, 2)

- Richtlinien für die staatliche Förderung der Betreuung bei der Existenzgründung und Betriebsübernahme in der Vorgründungsphase (Richtlinie V – BayMBl. 2025 Nr. 113 (`baymbl-2023-580`): Inkrafttreten am 2024-01-01, nach dem Stichtag: „Diese Bekanntmachung tritt am 1. Januar 2024 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.“
- Vorgründungsphase (Richtlinie Vorgründungs- und Nachfolgecoaching)“ – BayMBl. 2025 Nr. 113 (`baymbl-2023-580`): Inkrafttreten am 2024-01-01, nach dem Stichtag: „Diese Bekanntmachung tritt am 1. Januar 2024 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.“

### `begin-no-commencement-clause` (undetermined, 16)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Gelenkklasse an einer Grundschule” – BayMBl. 2024 Nr. 56 (`kwmbl-2010-18-332`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Modellversuch „Islamischer Unterricht“ – BayMBl. 2024 Nr. 120 (`kwmbl-2010-4-38`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Ferienordnung und schulfreie Samstage für das Schuljahr – BayMBl. 2024 Nr. 120 (`kwmbl-2010-21-520`): Keine Inkrafttretensvorschrift im Text der Stammverkündung; Beginn der Geltung nicht belegt (Ausfertigung ist nicht Textgeltung)
- … 13 weitere in `candidates.json`

### `begin-unreadable` (undetermined, 1)

- Abdrucken von Gerichtskostenstemplern – BayMBl. 2025 Nr. 574 (`jmbl-2012-7-58`): Mehrere Inkrafttretensregeln („Diese Bekanntmachung tritt mit Wirkung vom 1. April 2012 in Kraft.“; „Diese Vereinbarung tritt mit dem 1. des Monats in Kraft, der auf den Tag folgt, an dem die letzte unterzeichnete Vereinb“)

### `chain-correction` (incomplete-chain, 2)

- Fachhochschulreife; hier: Zeugnismuster – BayMBl. 2024 Nr. 257 (`baymbl-2022-364`): Fundstelle mit Berichtigung (ber. Nr. 405); Berichtigungen werden nicht angewandt
- Antragsstellung auf Einrichtung einer erweiterten Schulleitung im Schuljahr 2024/2025 – BayMBl. 2024 Nr. 558 (`baymbl-2023-469`): Fundstelle mit Berichtigung (ber. Nr. 473); Berichtigungen werden nicht angewandt

### `chain-fulltext-unverified` (incomplete-chain, 1)

- Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über die Würdigung ehrenamtlicher/freiwilli – BayMBl. 2024 Nr. 611 (`kwmbl-2015-2-7-2`): BayMBl.-Volltextsuche „13. Januar 2015 KWMBl. S. 7“ und „13. Januar 2015 KWMBl. 7“ (44 Treffer) findet die zitierende(n) Seite(n) https://www.verkuendung-bayern.de/baymbl/2024-611/ nicht – die Suche ist für diese Norm nicht belegt

### `citation-ambiguous` (undetermined, 1)

- Bayerischen Besoldungsgesetzes und weiterer Rechtsvorschriften – GVBl. 2026 S. 208: 2 Zitate mit verschiedener Fundstelle oder Änderungsklausel (Einheiten 286, 287)

### `enacted-after-baseline` (not-at-baseline, 10)

- Bekanntmachung des Staatsministeriums für Gesundheit, Pflege und Prävention über die Ehrungen für Verdienste um Gesundheit, Pflege und Präve – BayMBl. 2024 Nr. 620: Ausgefertigt am 2024-04-22, nach dem Stichtag 2023-12-01
- Alltagskompetenzen – Schule fürs Leben“ an kommunalen Schulen und an privaten Ersatzschulen – BayMBl. 2025 Nr. 127: Ausgefertigt am 2025-02-11, nach dem Stichtag 2023-12-01
- Landeshauptstadt München – BayMBl. 2025 Nr. 219: Ausgefertigt am 2025-02-06, nach dem Stichtag 2023-12-01
- … 7 weitere in `candidates.json`

### `end-undetermined` (undetermined, 3)

- Obersten Baubehörde im Bayerischen Staatsministerium des Innern – BayMBl. 2024 Nr. 230: Aufhebende Verkündung ohne lesbare Grundregel zum Inkrafttreten
- Obersten Baubehörde – BayMBl. 2025 Nr. 77: Inkrafttretensvorschrift der aufhebenden Verkündung nicht lesbar: „Abweichend hiervon gelten während der Übergangsphase der Zentralisierung der Stellenbewirtschaftung für die Beschäftigten der Bauämter im Zuständigkeitsbereich “
- Bayerischen Staatsministeriums für Wohnen, Bau und Verkehr – BayMBl. 2026 Nr. 380: Aufhebende Verkündung ohne lesbare Grundregel zum Inkrafttreten

### `identity-not-strong` (undetermined, 5)

- Bekanntmachung über die Führung des Schiffsregisters und des Schiffsbauregisters – BayMBl. 2024 Nr. 226: Zuordnung im Ereignisregister nur supporting (exact-title)
- Veröffentlichung im Bayerischen Ministerialblatt – BayMBl. 2025 Nr. 585: Zuordnung im Ereignisregister nur supporting (exact-title)
- Bekanntmachung über den Vollzug des Bundeszentralregistergesetzes – BayMBl. 2026 Nr. 282: Zuordnung im Ereignisregister nur supporting (exact-title)
- … 2 weitere in `candidates.json`

### `scope-normativity-review` (undetermined, 3)

- Dienstvereinbarung – BayMBl. 2024 Nr. 196 (`baymbl-2022-410`): Prüffall nach docs/LEGAL_SCOPE.md („Dienstvereinbarung“ im Titel „Dienstvereinbarung über Telearbeit und Mobile Arbeit im Geschäftsbereich des bayerischen Justizvollzugs“): Vorschriftencharakter wird nicht automatisch festgestellt
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst über die Satzung der Stiftung Regensburger Centrum für Interven – BayMBl. 2024 Nr. 262 (`kwmbl-2018-12-376`): Prüffall nach docs/LEGAL_SCOPE.md („Satzung“ im Titel „Satzung der Stiftung Regensburger Centrum für Interventionelle Immunologie (RCI)“): Vorschriftencharakter wird nicht automatisch festgestellt
- Bekanntmachung des Bayerischen Staatsministeriums des Innern, für Bau und Verkehr über das Muster für Konzessionsverträge zwischen Gemeinden – BayMBl. 2026 Nr. 290 (`allmbl-2015-2-67`): Prüffall nach docs/LEGAL_SCOPE.md („Muster“ im Titel „Muster für Konzessionsverträge zwischen Gemeinden und Elektrizitätsversorgungsunternehmen (Musterkonzessionsvertrag Stro“): Vorschriftencharakter wird nicht automatisch festgestellt

### `scope-not-state-regulation` (out-of-scope, 1)

- Bekanntmachung des Bayerischen Landesamts für Statistik über die Allgemeinen Gemeinde- und Landkreiswahlen am 15. März 2020; Meldung der Wah – BayMBl. 2026 Nr. 290 (`baymbl-2019-522`): Erlassstelle „Bekanntmachung des Bayerischen Landesamts für Statistik“ ist keine Stelle der Staatsverwaltung; keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)

### `scope-publication-notice` (out-of-scope, 20)

- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Telemedienkonzepte des Deutschlandradios – BayMBl. 2024 Nr. 262 (`kwmbl-2010-9-142`): Hinweis, dass ein Dokument einer Rundfunkanstalt an anderer Stelle veröffentlicht worden ist; kein Regelungsgehalt einer Stelle der Staatsverwaltung (docs/LEGAL_SCOPE.md: Informationsmitteilungen, Tatsachenbekanntmachungen)
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über die Telemedienkonzepte „KI.KAplus – die Mediath – BayMBl. 2024 Nr. 262 (`kwmbl-2010-16-259`): Hinweis, dass ein Dokument einer Rundfunkanstalt an anderer Stelle veröffentlicht worden ist; kein Regelungsgehalt einer Stelle der Staatsverwaltung (docs/LEGAL_SCOPE.md: Informationsmitteilungen, Tatsachenbekanntmachungen)
- Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft, Forschung und Kunst über das Telemedienkonzept „DasErste.de“ – BayMBl. 2024 Nr. 262 (`kwmbl-2010-19-446`): Veröffentlichung des Telemedienkonzepts einer Rundfunkanstalt (§ 11f Abs. 7 RStV, § 32 Abs. 7 MStV) – das Staatsministerium macht nur bekannt; kein Regelungsgehalt einer Stelle der Staatsverwaltung (docs/LEGAL_SCOPE.md: Informationsmitteilungen, Tatsachenbekanntmachungen)
- … 17 weitere in `candidates.json`

### `text-structure-unsupported` (undetermined, 3)

- Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch „Flexible Grundschule” vom 2. August 2010  – BayMBl. 2024 Nr. 56 (`kwmbl-2010-17-266`): https://www.verkuendung-bayern.de/amtsblatt/dokument/kwmbl-2010-17-266/: Element <tr> innerhalb eines Absatzes
- Innern, für Bau und Verkehr – BayMBl. 2024 Nr. 589 (`allmbl-2017-10-456`): https://www.verkuendung-bayern.de/amtsblatt/dokument/allmbl-2017-10-456/: Tabelle ohne schlüssiges Raster: tabelle[0].children[8]: belegt 2 statt 3 Spalten
- Bekanntmachung des Bayerischen Staatsministeriums des Innern, für Bau und Verkehr über Aufstellung und Vollzug der Haushaltspläne der Kommun – BayMBl. 2026 Nr. 290 (`allmbl-2018-2-200`): https://www.verkuendung-bayern.de/amtsblatt/dokument/allmbl-2018-2-200/: Element <td> in einer Tabelle

## 5 Grenzen

- Ausgangsfassungen vor 2009 (Amtsblätter nur gedruckt), nicht verkündete Schreiben und Blätter außerhalb der Verkündungsplattform bleiben `missing-base`; es gibt keine OCR und keinen Text aus Sekundärquellen.
- Verwaltungsvorschriften, die bis 31. Dezember 2015 erlassen wurden, gelten nach der VwVWBek nur fort, wenn sie in der Positivliste stehen (Textlayer vollständig zerlegt, kein OCR). Nicht gelistet heißt: galt am Stichtag nicht (`vwvwbek-not-listed`); vor 2016 geändert (Fassungsdatum ≠ Erlassdatum) verlangt eine Änderung dieses Datums in der Gegenprobe, sonst `vwvwbek-amended-before-2016`.
- Die Kette wird im BayMBl. per Volltextsuche nach Ausfertigungsdatum und Fundstelle gegengeprüft (Gliederungsnummern allein übersehen Sammeländerungen, belegt an BayMBl. 2022 Nr. 766; beim AllMBl. auch in der Schreibweise „AIIMBl.“); die Amtsblätter 2009–2018 haben keine Volltextsuche – dort wird jede Veröffentlichung des Zeitraums gelesen, höchstens 640 Ausgaben und 4000 Veröffentlichungen je Norm; darüber bleibt es `chain-amtsblatt-unsearchable`.
- Änderungen werden mit den Wortlautformeln der Rückrechnung angewandt (`reconstruction/formulas.ts`) und mit den Strukturbefehlen vorwärts (`structured.ts`): Neufassung und Einfügung auch gegliederter Glieder und Bereiche nach einer Vorlage, Umnummerierung, Satzbefehle, Streichungen, Überschrift der Norm; Aufhebungen einzelner Glieder, Tabellen, Berichtigungen und zusammengesetzte Befehle bleiben `incomplete-chain`.
- Beginn, Wirksamwerden und Ende mit Kalenderdatum oder relativ zur Veröffentlichung – dann nur mit dem Veröffentlichungsdatum, das die Verkündung selbst druckt und das Register bestätigt; das Veröffentlichungsdatum selbst ist nie das Inkrafttreten.
- Zitat ohne Fundstelle: nur Amtsblätter 2009–2018 über ihre Inhaltsübersichten (Erlassdatum und Titel, genau eine Zeile); nicht verkündete Schreiben bleiben `base-unpublished`.
- Umfang: entschieden nur, wo `docs/LEGAL_SCOPE.md` eindeutig ist (Veröffentlichungshinweise zu Rundfunkdokumenten nicht, Zeugnismuster-Vorschriften ja); sonst Review.
- Anlagen nur als PDF: Vordrucke, Muster, Verzeichnisse, Stundentafeln und Übersichten einer im HTML vollständigen Vorschrift werden archiviert und referenziert (Hinweis `annex-pdf-only` am Eintrag); Kopferlasse und Anlagen mit möglichem Regelungsgehalt bleiben `missing-base`.
- Fingerabdrücke gelten dem Quelltext vor der Überleitung; eine Änderung der Überleitung macht kein Rezept ungültig.
