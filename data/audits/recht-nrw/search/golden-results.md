# Golden Query Set – Ergebnisse

Stand: 2026-09-16T22:24:20.735Z · 94 Anfragen (data/audits/recht-nrw/search/golden-queries.json) · lokale SQLite-Projektion des West-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 94.1 % | 0.933 | 100.0 % | 100.0 % | 100.0 % | 0 | 72.1 | 305.4 | 780.9 |
| and-first | 94.1 % | 0.933 | 100.0 % | 100.0 % | 100.0 % | 0 | 5.9 | 31.4 | 66 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 9 | 100.0 % / 1 / 100.0 % / 0 / 290 | 100.0 % / 1 / 100.0 % / 0 / 11.7 |
| partial-title | 8 | 100.0 % / 0.917 / 100.0 % / 0 / 8.9 | 100.0 % / 0.917 / 100.0 % / 0 / 2.8 |
| abbreviation | 10 | 100.0 % / 1 / 100.0 % / 0 / 44.7 | 100.0 % / 1 / 100.0 % / 0 / 2.3 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 35.2 | 100.0 % / 1 / 100.0 % / 0 / 1.4 |
| paragraph-address | 9 | 100.0 % / 1 / 100.0 % / 0 / 183.2 | 100.0 % / 1 / 100.0 % / 0 / 28.9 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 401.8 | 100.0 % / 1 / 100.0 % / 0 / 31.4 |
| lrmb-number | 5 | 100.0 % / 1 / 100.0 % / 0 / 652.8 | 100.0 % / 1 / 100.0 % / 0 / 30.1 |
| common-word | 4 | – / – / – / 0 / 139.4 | – / – / – / 0 / 66 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 207.2 | 100.0 % / 1 / 100.0 % / 0 / 6 |
| typo | 5 | 0.0 % / 0 / – / 0 / 30.7 | 0.0 % / 0 / – / 0 / 26.6 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 780.9 | 100.0 % / 1 / 100.0 % / 0 / 8.5 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 338.2 | 100.0 % / 1 / 100.0 % / 0 / 24.6 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 271.4 | 100.0 % / 1 / 100.0 % / 0 / 22.5 |
| vwv-title | 6 | 100.0 % / 1 / 100.0 % / 0 / 283.1 | 100.0 % / 1 / 100.0 % / 0 / 19.9 |
| federal-reference | 5 | 100.0 % / 1 / – / 0 / 37.2 | 100.0 % / 1 / – / 0 / 9 |
| null-result | 4 | – / – / – / 0 / 8.8 | – / – / – / 0 / 0.3 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- abbreviation-01 „LÖG West“: or-prefix Rang 1 / 67 gesamt → and-first Rang 1 / 19 gesamt
- paragraph-address-01 „§ 1 LÖG West“: or-prefix Rang 1 / 50 gesamt → and-first Rang 1 / 19 gesamt
- exact-title-01 „Verfassung für das Land Westdeutschland“: or-prefix Rang 1 / 119 gesamt → and-first Rang 1 / 35 gesamt
- exact-title-03 „Gesetz über den öffentlichen Gesundheitsdienst des Landes Westdeutschland“: or-prefix Rang 1 / 23 gesamt → and-first Rang 1 / 4 gesamt
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
- common-word-04 „Land Westdeutschland“: or-prefix Rang – / 1134 gesamt → and-first Rang – / 615 gesamt

