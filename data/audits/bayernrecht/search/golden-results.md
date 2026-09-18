# Golden Query Set BayWü – Ergebnisse

Stand: 2026-09-18T09:22:28.808Z · 117 Anfragen (data/audits/bayernrecht/search/golden-queries.json) · lokale SQLite-Projektion des BayWü-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 93.5 % | 0.903 | 100.0 % | 100.0 % | 100.0 % | 0 | 69.4 | 563.1 | 924.4 |
| and-first | 94.4 % | 0.925 | 100.0 % | 100.0 % | 100.0 % | 0 | 9 | 62.2 | 185.1 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 18 | 100.0 % / 1 / 100.0 % / 0 / 692.1 | 100.0 % / 1 / 100.0 % / 0 / 55.5 |
| partial-title | 8 | 100.0 % / 0.838 / 100.0 % / 0 / 61.3 | 100.0 % / 0.833 / 100.0 % / 0 / 49.4 |
| abbreviation | 8 | 100.0 % / 1 / 100.0 % / 0 / 39.9 | 100.0 % / 1 / 100.0 % / 0 / 8.9 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 1.9 | 100.0 % / 1 / 100.0 % / 0 / 1.5 |
| paragraph-address | 7 | 100.0 % / 1 / 100.0 % / 0 / 78.4 | 100.0 % / 1 / 100.0 % / 0 / 57.5 |
| article-address | 11 | 100.0 % / 1 / 100.0 % / 0 / 508.7 | 100.0 % / 1 / 100.0 % / 0 / 68.3 |
| lrmb-number | 15 | 86.7 % / 0.73 / 100.0 % / 0 / 924.4 | 93.3 % / 0.889 / 100.0 % / 0 / 76.6 |
| common-word | 5 | – / – / – / 0 / 267.5 | – / – / – / 0 / 185.1 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 236.5 | 100.0 % / 1 / 100.0 % / 0 / 10.5 |
| typo | 5 | 0.0 % / 0 / – / 0 / 70 | 0.0 % / 0 / – / 0 / 60.8 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 452.1 | 100.0 % / 1 / 100.0 % / 0 / 16.3 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 600.6 | 100.0 % / 1 / 100.0 % / 0 / 54.9 |
| verordnung-title | 8 | 100.0 % / 1 / 100.0 % / 0 / 552.2 | 100.0 % / 1 / 100.0 % / 0 / 29.1 |
| vwv-title | 6 | 100.0 % / 1 / 100.0 % / 0 / 245.1 | 100.0 % / 1 / 100.0 % / 0 / 12.5 |
| federal-reference | 1 | – / – / – / 0 / 6.1 | – / – / – / 0 / 5.3 |
| null-result | 4 | – / – / – / 0 / 23 | – / – / – / 0 / 0.6 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- exact-title-02 „Gesetz zur Ergänzung des Reichssiedlungsgesetzes“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-05 „Gesetz über das Bayern-Württembergische Selbstverwaltungskolleg“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-06 „Gesetz über die Immobilien Freistaat Bayern-Württemberg“: or-prefix Rang 1 / 23 gesamt → and-first Rang 1 / 3 gesamt
- exact-title-08 „Gesetz zur Ergänzung und Ausführung des Gesetzes zur vorläufigen Regelung des Rechts der Industrie- und Handelskammern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- vwv-title-01 „Geschäftsordnung des Bayern-Württembergischen Landespersonalausschusses“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- vwv-title-02 „Erteilung von Verwarnungen wegen Ordnungswidrigkeiten durch Polizeivollzugsbeamte“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 3 gesamt
- partial-title-01 „Richtlinien Inklusion behinderter“: or-prefix Rang 1 / 7 gesamt → and-first Rang 1 / 6 gesamt
- partial-title-02 „Vollzug“: or-prefix Rang 5 / 414 gesamt → and-first Rang 6 / 414 gesamt
- partial-title-04 „Aufstellung Vollzug Haushaltspläne“: or-prefix Rang 2 / 14 gesamt → and-first Rang 2 / 9 gesamt
- partial-title-05 „Förderrichtlinie Gewährung Zuwendungen“: or-prefix Rang 1 / 10 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-02 „FoeR-TH“: or-prefix Rang 1 / 228 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-03 „Nr. 1.1 Festsetzung der Zahl der ehrenamtlichen Richter in der bayern-württembergischen Sozialgerichtsbarkeit“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-04 „Verordnung über die Errichtung eines Staatsinstituts für die Ausbildung von Förderlehrern“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-05 „Zusätzliche Technische Vertragsbedingungen und Richtlinien für Fugen in Verkehrsflächen, Ausgabe 2015, ZTV Fug-StB 15“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- common-word-04 „Bayern-Württemberg“: or-prefix Rang – / 1565 gesamt → and-first Rang – / 1564 gesamt
- exact-title-09 „Gesetz über die Untersuchungsausschüsse des Bayern-Württembergischen Landtags“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-12 „Gesetz über die öffentlichen Sparkassen“: or-prefix Rang 1 / 20 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-18 „Gesetz über die Forstrechte“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 4 gesamt
- lrmb-number-07 „BayRS 313-4-S“: or-prefix Rang – / 26 gesamt → and-first Rang 3 / 5 gesamt
- lrmb-number-09 „BayRS 2034.4-F“: or-prefix Rang 2 / 6 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-11 „BayRS 2011-2-4-I“: or-prefix Rang – / 127 gesamt → and-first Rang – / 20 gesamt
- lrmb-number-13 „BayRS 1132-F“: or-prefix Rang 5 / 21 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-15 „BayRS 2013-2-2-I“: or-prefix Rang 4 / 143 gesamt → and-first Rang 1 / 20 gesamt

