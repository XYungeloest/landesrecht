# Golden Query Set – Ergebnisse

Stand: 2026-09-17T06:13:48.103Z · 94 Anfragen (data/audits/recht-nrw/search/golden-queries.json) · lokale SQLite-Projektion des West-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 94.1 % | 0.933 | 100.0 % | 100.0 % | 100.0 % | 0 | 177.3 | 723 | 1702.5 |
| and-first | 94.1 % | 0.933 | 100.0 % | 100.0 % | 100.0 % | 0 | 13.5 | 89.9 | 147.9 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 9 | 100.0 % / 1 / 100.0 % / 0 / 700.1 | 100.0 % / 1 / 100.0 % / 0 / 27.5 |
| partial-title | 8 | 100.0 % / 0.917 / 100.0 % / 0 / 20.5 | 100.0 % / 0.917 / 100.0 % / 0 / 6 |
| abbreviation | 10 | 100.0 % / 1 / 100.0 % / 0 / 107.1 | 100.0 % / 1 / 100.0 % / 0 / 4.9 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 84.5 | 100.0 % / 1 / 100.0 % / 0 / 2.9 |
| paragraph-address | 9 | 100.0 % / 1 / 100.0 % / 0 / 429.5 | 100.0 % / 1 / 100.0 % / 0 / 73.2 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 972.1 | 100.0 % / 1 / 100.0 % / 0 / 90.1 |
| lrmb-number | 5 | 100.0 % / 1 / 100.0 % / 0 / 1492.9 | 100.0 % / 1 / 100.0 % / 0 / 89.9 |
| common-word | 4 | – / – / – / 0 / 318.3 | – / – / – / 0 / 147.9 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 490.1 | 100.0 % / 1 / 100.0 % / 0 / 13.5 |
| typo | 5 | 0.0 % / 0 / – / 0 / 71.5 | 0.0 % / 0 / – / 0 / 68.7 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 1702.5 | 100.0 % / 1 / 100.0 % / 0 / 20.9 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 815.6 | 100.0 % / 1 / 100.0 % / 0 / 63.7 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 650 | 100.0 % / 1 / 100.0 % / 0 / 59.1 |
| vwv-title | 6 | 100.0 % / 1 / 100.0 % / 0 / 711 | 100.0 % / 1 / 100.0 % / 0 / 53.5 |
| federal-reference | 5 | 100.0 % / 1 / – / 0 / 95.6 | 100.0 % / 1 / – / 0 / 18.1 |
| null-result | 4 | – / – / – / 0 / 23.9 | – / – / – / 0 / 0.6 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- abbreviation-01 „LÖG West“: or-prefix Rang 1 / 70 gesamt → and-first Rang 1 / 19 gesamt
- paragraph-address-01 „§ 1 LÖG West“: or-prefix Rang 1 / 50 gesamt → and-first Rang 1 / 19 gesamt
- exact-title-01 „Verfassung für das Land Westdeutschland“: or-prefix Rang 1 / 118 gesamt → and-first Rang 1 / 36 gesamt
- exact-title-03 „Gesetz über den öffentlichen Gesundheitsdienst des Landes Westdeutschland“: or-prefix Rang 1 / 23 gesamt → and-first Rang 1 / 5 gesamt
- exact-title-05 „Gesetz zur Ausführung des Arbeitsgerichtsgesetzes im Lande Westdeutschland“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-07 „Gesetz zum Schutze der Berufsbezeichnung,,Ingenieur/Ingenieurin““: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-08 „Gesetz über die Westdeutsche Akademie der Wissenschaften und der Künste“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- verordnung-title-05 „Verordnung über die Berichterstattung von Versicherungsunternehmen“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt
- partial-title-05 „Studentenwerke Ausbildungsförderung“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 2 gesamt
- partial-title-06 „Durchführung Hebammengesetzes“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- abbreviation-09 „LVV“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- umlaut-variant-08 „Verordnung ueber die elektronische Aktenfuehrung in Bußgeldverfahren“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-09 „Verordnung uber die elektronische Aktenfuhrung in Bussgeldverfahren“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt
- paragraph-address-03 „§ 3 UVPG West“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 1 gesamt
- paragraph-address-09 „§ 3 VO VwVG West“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 1 gesamt
- common-word-04 „Land Westdeutschland“: or-prefix Rang – / 1172 gesamt → and-first Rang – / 644 gesamt

