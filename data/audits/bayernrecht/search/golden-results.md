# Golden Query Set BayWü – Ergebnisse

Stand: 2026-09-19T15:36:54.993Z · 128 Anfragen (data/audits/bayernrecht/search/golden-queries.json) · lokale SQLite-Projektion des BayWü-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 94.1 % | 0.912 | 100.0 % | 100.0 % | 100.0 % | 0 | 33.8 | 285 | 493.4 |
| and-first | 94.9 % | 0.931 | 100.0 % | 100.0 % | 100.0 % | 0 | 4.1 | 33.3 | 123.7 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 19 | 100.0 % / 1 / 100.0 % / 0 / 361.7 | 100.0 % / 1 / 100.0 % / 0 / 27 |
| partial-title | 14 | 100.0 % / 0.907 / 100.0 % / 0 / 82.9 | 100.0 % / 0.905 / 100.0 % / 0 / 34.1 |
| abbreviation | 11 | 100.0 % / 1 / 100.0 % / 0 / 21.5 | 100.0 % / 1 / 100.0 % / 0 / 4.7 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 1 | 100.0 % / 1 / 100.0 % / 0 / 0.8 |
| paragraph-address | 7 | 100.0 % / 1 / 100.0 % / 0 / 33.4 | 100.0 % / 1 / 100.0 % / 0 / 27.1 |
| article-address | 11 | 100.0 % / 1 / 100.0 % / 0 / 273.9 | 100.0 % / 1 / 100.0 % / 0 / 31 |
| lrmb-number | 15 | 86.7 % / 0.727 / 100.0 % / 0 / 493.4 | 93.3 % / 0.883 / 100.0 % / 0 / 40.4 |
| common-word | 5 | – / – / – / 0 / 167.2 | – / – / – / 0 / 123.7 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 121.8 | 100.0 % / 1 / 100.0 % / 0 / 5.3 |
| typo | 5 | 0.0 % / 0 / – / 0 / 33.8 | 0.0 % / 0 / – / 0 / 30.9 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 225.4 | 100.0 % / 1 / 100.0 % / 0 / 8.5 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 303 | 100.0 % / 1 / 100.0 % / 0 / 28.3 |
| verordnung-title | 8 | 100.0 % / 1 / 100.0 % / 0 / 306.8 | 100.0 % / 1 / 100.0 % / 0 / 15 |
| vwv-title | 7 | 100.0 % / 1 / 100.0 % / 0 / 127.5 | 100.0 % / 1 / 100.0 % / 0 / 6.3 |
| federal-reference | 1 | – / – / – / 0 / 3.4 | – / – / – / 0 / 3.2 |
| null-result | 4 | – / – / – / 0 / 9.6 | – / – / – / 0 / 0.3 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- exact-title-02 „Gesetz zur Ergänzung des Reichssiedlungsgesetzes“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-05 „Gesetz über das Bayern-Württembergische Selbstverwaltungskolleg“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-06 „Gesetz über die Immobilien Freistaat Bayern-Württemberg“: or-prefix Rang 1 / 29 gesamt → and-first Rang 1 / 3 gesamt
- exact-title-08 „Gesetz zur Ergänzung und Ausführung des Gesetzes zur vorläufigen Regelung des Rechts der Industrie- und Handelskammern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- verordnung-title-01 „Verordnung über die Verwendung des Tronc der Spielbanken in Bayern-Württemberg“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- vwv-title-01 „Geschäftsordnung des Bayern-Württembergischen Landespersonalausschusses“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- vwv-title-02 „Erteilung von Verwarnungen wegen Ordnungswidrigkeiten durch Polizeivollzugsbeamte“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 3 gesamt
- partial-title-01 „Richtlinien Inklusion behinderter“: or-prefix Rang 1 / 7 gesamt → and-first Rang 1 / 6 gesamt
- partial-title-02 „Vollzug“: or-prefix Rang 5 / 442 gesamt → and-first Rang 6 / 442 gesamt
- partial-title-04 „Aufstellung Vollzug Haushaltspläne“: or-prefix Rang 2 / 14 gesamt → and-first Rang 2 / 9 gesamt
- partial-title-05 „Förderrichtlinie Gewährung Zuwendungen“: or-prefix Rang 1 / 12 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-02 „FoeR-TH“: or-prefix Rang 1 / 251 gesamt → and-first Rang 1 / 1 gesamt
- article-address-01 „Art. 1 Übereinkommen über den Schutz des Bodensees gegen Verunreinigung“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-03 „Nr. 1.1 Festsetzung der Zahl der ehrenamtlichen Richter in der bayern-württembergischen Sozialgerichtsbarkeit“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-04 „Verordnung über die Errichtung eines Staatsinstituts für die Ausbildung von Förderlehrern“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-05 „Zusätzliche Technische Vertragsbedingungen und Richtlinien für Fugen in Verkehrsflächen, Ausgabe 2015, ZTV Fug-StB 15“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- common-word-04 „Bayern-Württemberg“: or-prefix Rang – / 1681 gesamt → and-first Rang – / 1680 gesamt
- exact-title-09 „Gesetz über die Untersuchungsausschüsse des Bayern-Württembergischen Landtags“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-12 „Gesetz über die öffentlichen Sparkassen“: or-prefix Rang 1 / 21 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-18 „Gesetz über die Forstrechte“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 4 gesamt
- lrmb-number-07 „BayRS 313-4-S“: or-prefix Rang – / 27 gesamt → and-first Rang 4 / 6 gesamt
- lrmb-number-09 „BayRS 2034.4-F“: or-prefix Rang 2 / 6 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-11 „BayRS 2011-2-4-I“: or-prefix Rang – / 137 gesamt → and-first Rang – / 21 gesamt
- lrmb-number-13 „BayRS 1132-F“: or-prefix Rang 5 / 21 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-15 „BayRS 2013-2-2-I“: or-prefix Rang 5 / 152 gesamt → and-first Rang 1 / 21 gesamt
- curated-historical-02 „Konkordat Papst Pius XI. Staate Bayern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt

