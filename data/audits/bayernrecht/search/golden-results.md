# Golden Query Set BayWü – Ergebnisse

Stand: 2026-09-18T13:47:40.853Z · 128 Anfragen (data/audits/bayernrecht/search/golden-queries.json) · lokale SQLite-Projektion des BayWü-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 94.1 % | 0.912 | 100.0 % | 100.0 % | 100.0 % | 0 | 110.9 | 723.8 | 1254.4 |
| and-first | 94.9 % | 0.932 | 100.0 % | 100.0 % | 100.0 % | 0 | 8.8 | 85.7 | 195.4 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 19 | 100.0 % / 1 / 100.0 % / 0 / 954.5 | 100.0 % / 1 / 100.0 % / 0 / 67.5 |
| partial-title | 14 | 100.0 % / 0.907 / 100.0 % / 0 / 234.1 | 100.0 % / 0.905 / 100.0 % / 0 / 58.1 |
| abbreviation | 11 | 100.0 % / 1 / 100.0 % / 0 / 68.6 | 100.0 % / 1 / 100.0 % / 0 / 9.3 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 2 | 100.0 % / 1 / 100.0 % / 0 / 1.4 |
| paragraph-address | 7 | 100.0 % / 1 / 100.0 % / 0 / 119.8 | 100.0 % / 1 / 100.0 % / 0 / 79.2 |
| article-address | 11 | 100.0 % / 1 / 100.0 % / 0 / 676.8 | 100.0 % / 1 / 100.0 % / 0 / 90.1 |
| lrmb-number | 15 | 86.7 % / 0.727 / 100.0 % / 0 / 1254.4 | 93.3 % / 0.889 / 100.0 % / 0 / 105.2 |
| common-word | 5 | – / – / – / 0 / 339.9 | – / – / – / 0 / 195.4 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 362.5 | 100.0 % / 1 / 100.0 % / 0 / 10.5 |
| typo | 5 | 0.0 % / 0 / – / 0 / 76.5 | 0.0 % / 0 / – / 0 / 73.5 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 581 | 100.0 % / 1 / 100.0 % / 0 / 16.8 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 757.5 | 100.0 % / 1 / 100.0 % / 0 / 67.2 |
| verordnung-title | 8 | 100.0 % / 1 / 100.0 % / 0 / 723.8 | 100.0 % / 1 / 100.0 % / 0 / 30.3 |
| vwv-title | 7 | 100.0 % / 1 / 100.0 % / 0 / 328.2 | 100.0 % / 1 / 100.0 % / 0 / 12.2 |
| federal-reference | 1 | – / – / – / 0 / 9.4 | – / – / – / 0 / 6.7 |
| null-result | 4 | – / – / – / 0 / 21.9 | – / – / – / 0 / 1.1 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- exact-title-02 „Gesetz zur Ergänzung des Reichssiedlungsgesetzes“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-05 „Gesetz über das Bayern-Württembergische Selbstverwaltungskolleg“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-06 „Gesetz über die Immobilien Freistaat Bayern-Württemberg“: or-prefix Rang 1 / 25 gesamt → and-first Rang 1 / 3 gesamt
- exact-title-08 „Gesetz zur Ergänzung und Ausführung des Gesetzes zur vorläufigen Regelung des Rechts der Industrie- und Handelskammern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- verordnung-title-01 „Verordnung über die Verwendung des Tronc der Spielbanken in Bayern-Württemberg“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- vwv-title-01 „Geschäftsordnung des Bayern-Württembergischen Landespersonalausschusses“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- vwv-title-02 „Erteilung von Verwarnungen wegen Ordnungswidrigkeiten durch Polizeivollzugsbeamte“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 3 gesamt
- partial-title-01 „Richtlinien Inklusion behinderter“: or-prefix Rang 1 / 7 gesamt → and-first Rang 1 / 6 gesamt
- partial-title-02 „Vollzug“: or-prefix Rang 5 / 424 gesamt → and-first Rang 6 / 424 gesamt
- partial-title-04 „Aufstellung Vollzug Haushaltspläne“: or-prefix Rang 2 / 14 gesamt → and-first Rang 2 / 9 gesamt
- partial-title-05 „Förderrichtlinie Gewährung Zuwendungen“: or-prefix Rang 1 / 12 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-02 „FoeR-TH“: or-prefix Rang 1 / 238 gesamt → and-first Rang 1 / 1 gesamt
- article-address-01 „Art. 1 Übereinkommen über den Schutz des Bodensees gegen Verunreinigung“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-03 „Nr. 1.1 Festsetzung der Zahl der ehrenamtlichen Richter in der bayern-württembergischen Sozialgerichtsbarkeit“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-04 „Verordnung über die Errichtung eines Staatsinstituts für die Ausbildung von Förderlehrern“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-05 „Zusätzliche Technische Vertragsbedingungen und Richtlinien für Fugen in Verkehrsflächen, Ausgabe 2015, ZTV Fug-StB 15“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- common-word-04 „Bayern-Württemberg“: or-prefix Rang – / 1620 gesamt → and-first Rang – / 1619 gesamt
- exact-title-09 „Gesetz über die Untersuchungsausschüsse des Bayern-Württembergischen Landtags“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-12 „Gesetz über die öffentlichen Sparkassen“: or-prefix Rang 1 / 21 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-18 „Gesetz über die Forstrechte“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 4 gesamt
- lrmb-number-07 „BayRS 313-4-S“: or-prefix Rang – / 26 gesamt → and-first Rang 3 / 5 gesamt
- lrmb-number-09 „BayRS 2034.4-F“: or-prefix Rang 2 / 6 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-11 „BayRS 2011-2-4-I“: or-prefix Rang – / 132 gesamt → and-first Rang – / 20 gesamt
- lrmb-number-13 „BayRS 1132-F“: or-prefix Rang 5 / 21 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-15 „BayRS 2013-2-2-I“: or-prefix Rang 5 / 147 gesamt → and-first Rang 1 / 20 gesamt
- curated-historical-02 „Konkordat Papst Pius XI. Staate Bayern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt

