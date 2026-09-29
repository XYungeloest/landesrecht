# Golden Query Set BayWü – Ergebnisse

Stand: 2026-09-29T12:22:59.601Z · 119 Anfragen (data/audits/bayernrecht/search/golden-queries.json) · lokale SQLite-Projektion des BayWü-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 93.5 % | 0.904 | 100.0 % | 100.0 % | 100.0 % | 0 | 91 | 557.7 | 813.4 |
| and-first | 94.4 % | 0.926 | 100.0 % | 100.0 % | 100.0 % | 0 | 8.1 | 87.3 | 335.9 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 19 | 100.0 % / 1 / 100.0 % / 0 / 695.7 | 100.0 % / 1 / 100.0 % / 0 / 57.2 |
| partial-title | 13 | 100.0 % / 0.892 / 100.0 % / 0 / 165.1 | 100.0 % / 0.889 / 100.0 % / 0 / 91.7 |
| abbreviation | 10 | 100.0 % / 1 / 100.0 % / 0 / 36.4 | 100.0 % / 1 / 100.0 % / 0 / 3 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 2.2 | 100.0 % / 1 / 100.0 % / 0 / 1.9 |
| paragraph-address | 6 | 100.0 % / 1 / 100.0 % / 0 / 68.4 | 100.0 % / 1 / 100.0 % / 0 / 58.9 |
| article-address | 7 | 100.0 % / 1 / 100.0 % / 0 / 498.4 | 100.0 % / 1 / 100.0 % / 0 / 69.3 |
| lrmb-number | 14 | 85.7 % / 0.711 / 100.0 % / 0 / 813.4 | 92.9 % / 0.881 / 100.0 % / 0 / 89 |
| common-word | 5 | – / – / – / 0 / 420.6 | – / – / – / 0 / 335.9 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 239 | 100.0 % / 1 / 100.0 % / 0 / 11.3 |
| typo | 5 | 0.0 % / 0 / – / 0 / 68.7 | 0.0 % / 0 / – / 0 / 65.9 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 442 | 100.0 % / 1 / 100.0 % / 0 / 17.7 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 589 | 100.0 % / 1 / 100.0 % / 0 / 63 |
| verordnung-title | 7 | 100.0 % / 1 / 100.0 % / 0 / 565.4 | 100.0 % / 1 / 100.0 % / 0 / 30.7 |
| vwv-title | 7 | 100.0 % / 1 / 100.0 % / 0 / 238.9 | 100.0 % / 1 / 100.0 % / 0 / 13.9 |
| federal-reference | 1 | – / – / – / 0 / 7.6 | – / – / – / 0 / 6.8 |
| null-result | 4 | – / – / – / 0 / 19.4 | – / – / – / 0 / 0.8 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- exact-title-02 „Gesetz zur Ergänzung des Reichssiedlungsgesetzes“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-05 „Gesetz über das Bayern-Württembergische Selbstverwaltungskolleg“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-06 „Gesetz über die Immobilien Freistaat Bayern-Württemberg“: or-prefix Rang 1 / 29 gesamt → and-first Rang 1 / 3 gesamt
- exact-title-08 „Gesetz zur Ergänzung und Ausführung des Gesetzes zur vorläufigen Regelung des Rechts der Industrie- und Handelskammern“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- verordnung-title-01 „Verordnung über die Verwendung des Tronc der Spielbanken in Bayern-Württemberg“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- vwv-title-01 „Geschäftsordnung des Bayern-Württembergischen Landespersonalausschusses“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt
- vwv-title-02 „Erteilung von Verwarnungen wegen Ordnungswidrigkeiten durch Polizeivollzugsbeamte“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 3 gesamt
- partial-title-01 „Richtlinien Inklusion behinderter“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- partial-title-02 „Vollzug“: or-prefix Rang 5 / 419 gesamt → and-first Rang 6 / 419 gesamt
- partial-title-04 „Aufstellung Vollzug Haushaltspläne“: or-prefix Rang 2 / 14 gesamt → and-first Rang 2 / 9 gesamt
- partial-title-05 „Förderrichtlinie Gewährung Zuwendungen“: or-prefix Rang – / 11 gesamt → and-first Rang – / 2 gesamt
- umlaut-variant-02 „FoeR-TH“: or-prefix Rang 1 / 238 gesamt → and-first Rang 1 / 1 gesamt
- article-address-01 „Art. 1 Übereinkommen über den Schutz des Bodensees gegen Verunreinigung“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-03 „Nr. 1.1 Festsetzung der Zahl der ehrenamtlichen Richter in der bayern-württembergischen Sozialgerichtsbarkeit“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-04 „Verordnung über die Errichtung eines Staatsinstituts für die Ausbildung von Förderlehrern“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- similar-title-05 „Zusätzliche Technische Vertragsbedingungen und Richtlinien für Fugen in Verkehrsflächen, Ausgabe 2015, ZTV Fug-StB 15“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- common-word-04 „Bayern-Württemberg“: or-prefix Rang – / 1628 gesamt → and-first Rang – / 1627 gesamt
- exact-title-09 „Gesetz über die Untersuchungsausschüsse des Bayern-Württembergischen Landtags“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-12 „Gesetz über die öffentlichen Sparkassen“: or-prefix Rang 1 / 21 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-18 „Gesetz über die Forstrechte“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 2 gesamt
- lrmb-number-07 „BayRS 313-4-S“: or-prefix Rang – / 26 gesamt → and-first Rang 3 / 5 gesamt
- lrmb-number-09 „BayRS 2034.4-F“: or-prefix Rang 2 / 6 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-11 „BayRS 2011-2-4-I“: or-prefix Rang – / 130 gesamt → and-first Rang – / 20 gesamt
- lrmb-number-13 „BayRS 1132-F“: or-prefix Rang 4 / 18 gesamt → and-first Rang 1 / 1 gesamt
- lrmb-number-15 „BayRS 2013-2-2-I“: or-prefix Rang 5 / 137 gesamt → and-first Rang 1 / 18 gesamt
- curated-historical-02 „Konkordat Papst Pius XI. Staate Bayern“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt

