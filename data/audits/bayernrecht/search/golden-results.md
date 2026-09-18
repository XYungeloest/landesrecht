# Golden Query Set BayWü – Ergebnisse

Stand: 2026-09-18T11:33:33.492Z · 128 Anfragen (data/audits/bayernrecht/search/golden-queries.json) · lokale SQLite-Projektion des BayWü-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 94.1 % | 0.912 | 100.0 % | 100.0 % | 100.0 % | 0 | 104.7 | 724.8 | 1180.3 |
| and-first | 94.9 % | 0.932 | 100.0 % | 100.0 % | 100.0 % | 0 | 8.9 | 81.7 | 190.4 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 19 | 100.0 % / 1 / 100.0 % / 0 / 875.8 | 100.0 % / 1 / 100.0 % / 0 / 63.9 |
| partial-title | 14 | 100.0 % / 0.907 / 100.0 % / 0 / 227.4 | 100.0 % / 0.905 / 100.0 % / 0 / 61.3 |
| abbreviation | 11 | 100.0 % / 1 / 100.0 % / 0 / 46.7 | 100.0 % / 1 / 100.0 % / 0 / 8.9 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 1.8 | 100.0 % / 1 / 100.0 % / 0 / 1.4 |
| paragraph-address | 7 | 100.0 % / 1 / 100.0 % / 0 / 107.4 | 100.0 % / 1 / 100.0 % / 0 / 79.1 |
| article-address | 11 | 100.0 % / 1 / 100.0 % / 0 / 678 | 100.0 % / 1 / 100.0 % / 0 / 84.9 |
| lrmb-number | 15 | 86.7 % / 0.73 / 100.0 % / 0 / 1180.3 | 93.3 % / 0.889 / 100.0 % / 0 / 104 |
| common-word | 5 | – / – / – / 0 / 356.9 | – / – / – / 0 / 190.4 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 334.8 | 100.0 % / 1 / 100.0 % / 0 / 10.7 |
| typo | 5 | 0.0 % / 0 / – / 0 / 78.8 | 0.0 % / 0 / – / 0 / 68.4 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 558 | 100.0 % / 1 / 100.0 % / 0 / 16.3 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 750.6 | 100.0 % / 1 / 100.0 % / 0 / 59.3 |
| verordnung-title | 8 | 100.0 % / 1 / 100.0 % / 0 / 737.5 | 100.0 % / 1 / 100.0 % / 0 / 31.9 |
| vwv-title | 7 | 100.0 % / 1 / 100.0 % / 0 / 306.8 | 100.0 % / 1 / 100.0 % / 0 / 14.6 |
| federal-reference | 1 | – / – / – / 0 / 6.7 | – / – / – / 0 / 5.5 |
| null-result | 4 | – / – / – / 0 / 26.7 | – / – / – / 0 / 0.6 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- exact-title-02 „Gesetz zur Ergänzung des Reichssiedlungsgesetzes“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-05 „Gesetz über das Bayern-Württembergische Selbstverwaltungskolleg“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-06 „Gesetz über die Immobilien Freistaat Bayern-Württemberg“: or-prefix Rang 1 / 24 gesamt → and-first Rang 1 / 3 gesamt
- exact-title-08 „Gesetz zur Ergänzung und Ausführung des Gesetzes zur vorläufigen Regelung des Rechts der Industrie- und Handelskammern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- vwv-title-01 „Geschäftsordnung des Bayern-Württembergischen Landespersonalausschusses“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- vwv-title-02 „Erteilung von Verwarnungen wegen Ordnungswidrigkeiten durch Polizeivollzugsbeamte“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 3 gesamt
- partial-title-01 „Richtlinien Inklusion behinderter“: or-prefix Rang 1 / 7 gesamt → and-first Rang 1 / 6 gesamt
- partial-title-02 „Vollzug“: or-prefix Rang 5 / 421 gesamt → and-first Rang 6 / 421 gesamt
- partial-title-04 „Aufstellung Vollzug Haushaltspläne“: or-prefix Rang 2 / 14 gesamt → and-first Rang 2 / 9 gesamt
- partial-title-05 „Förderrichtlinie Gewährung Zuwendungen“: or-prefix Rang 1 / 11 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-02 „FoeR-TH“: or-prefix Rang 1 / 234 gesamt → and-first Rang 1 / 1 gesamt
- article-address-01 „Art. 1 Übereinkommen über den Schutz des Bodensees gegen Verunreinigung“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-03 „Nr. 1.1 Festsetzung der Zahl der ehrenamtlichen Richter in der bayern-württembergischen Sozialgerichtsbarkeit“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-04 „Verordnung über die Errichtung eines Staatsinstituts für die Ausbildung von Förderlehrern“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-05 „Zusätzliche Technische Vertragsbedingungen und Richtlinien für Fugen in Verkehrsflächen, Ausgabe 2015, ZTV Fug-StB 15“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- common-word-04 „Bayern-Württemberg“: or-prefix Rang – / 1599 gesamt → and-first Rang – / 1598 gesamt
- exact-title-09 „Gesetz über die Untersuchungsausschüsse des Bayern-Württembergischen Landtags“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-12 „Gesetz über die öffentlichen Sparkassen“: or-prefix Rang 1 / 21 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-18 „Gesetz über die Forstrechte“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 4 gesamt
- lrmb-number-07 „BayRS 313-4-S“: or-prefix Rang – / 26 gesamt → and-first Rang 3 / 5 gesamt
- lrmb-number-09 „BayRS 2034.4-F“: or-prefix Rang 2 / 6 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-11 „BayRS 2011-2-4-I“: or-prefix Rang – / 127 gesamt → and-first Rang – / 20 gesamt
- lrmb-number-13 „BayRS 1132-F“: or-prefix Rang 5 / 21 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-15 „BayRS 2013-2-2-I“: or-prefix Rang 4 / 146 gesamt → and-first Rang 1 / 20 gesamt
- curated-historical-02 „Konkordat Papst Pius XI. Staate Bayern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt

