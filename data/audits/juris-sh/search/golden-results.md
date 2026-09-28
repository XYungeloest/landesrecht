# Golden Query Set NSH – Ergebnisse

Stand: 2026-09-28T17:42:26.548Z · 125 Anfragen (data/audits/juris-sh/search/golden-queries.json) · lokale SQLite-Projektion des NSH-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 95.7 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 53.5 | 455.5 | 1135.3 |
| and-first | 95.7 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 8.8 | 49.3 | 156.9 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 18 | 100.0 % / 1 / 100.0 % / 0 / 456.7 | 100.0 % / 1 / 100.0 % / 0 / 17.8 |
| partial-title | 8 | 100.0 % / 0.796 / 100.0 % / 0 / 90.9 | 100.0 % / 0.796 / 100.0 % / 0 / 21 |
| abbreviation | 16 | 100.0 % / 1 / 100.0 % / 0 / 312.7 | 100.0 % / 1 / 100.0 % / 0 / 6.6 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 1.9 | 100.0 % / 1 / 100.0 % / 0 / 1.1 |
| paragraph-address | 15 | 100.0 % / 1 / 100.0 % / 0 / 76.6 | 100.0 % / 1 / 100.0 % / 0 / 46.9 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 1135.3 | 100.0 % / 1 / 100.0 % / 0 / 64.2 |
| lrmb-number | 8 | 100.0 % / 1 / – / 0 / 2.1 | 100.0 % / 1 / – / 0 / 1.1 |
| common-word | 5 | – / – / – / 0 / 208.9 | – / – / – / 0 / 156.9 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 338.9 | 100.0 % / 1 / 100.0 % / 0 / 10.1 |
| typo | 5 | 0.0 % / 0 / – / 0 / 13.2 | 0.0 % / 0 / – / 0 / 7 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 457.6 | 100.0 % / 1 / 100.0 % / 0 / 17.3 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 497.8 | 100.0 % / 1 / 100.0 % / 0 / 49.3 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 343.5 | 100.0 % / 1 / 100.0 % / 0 / 12.6 |
| vwv-title | 14 | 100.0 % / 1 / 100.0 % / 0 / 527.2 | 100.0 % / 1 / 100.0 % / 0 / 44 |
| federal-reference | 3 | 100.0 % / 1 / – / 0 / 9 | 100.0 % / 1 / – / 0 / 9.1 |
| null-result | 4 | – / – / – / 0 / 16.5 | – / – / – / 0 / 0.6 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- vwv-title-01 „Vertretung des Landes Niedersachsen-Holstein im Geschäftsbereich des Ministeriums für Landwirtschaft, ländliche Räume, Europa und Verbraucherschutz (MLLEV)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- long-title-01 „Landesverordnung über die Festsetzung eines Wasserschutzgebietes für die Wassergewinnungsanlagen der Stadtwerke Eckernförde (Wasserschutzgebietsverordnung Eckernförde-Süd)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- partial-title-01 „Änderung Richtlinien Strafverfahren“: or-prefix Rang 1 / 16 gesamt → and-first Rang 1 / 9 gesamt
- partial-title-03 „Änderung Allgemeinen Verfügung“: or-prefix Rang 5 / 127 gesamt → and-first Rang 5 / 55 gesamt
- partial-title-04 „Landesverordnung zuständigen Behörden“: or-prefix Rang 6 / 258 gesamt → and-first Rang 6 / 222 gesamt
- partial-title-05 „Grundsätze Prüfung technischer“: or-prefix Rang 1 / 16 gesamt → and-first Rang 1 / 2 gesamt
- umlaut-variant-01 „7. MAeStV HSH“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-02 „GlueStV 2021“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- paragraph-address-01 „§ 3 IZG-NSH“: or-prefix Rang 1 / 7 gesamt → and-first Rang 1 / 6 gesamt
- article-address-02 „Art. 1 Gesetz zu dem Abkommen zur Änderung des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische Prüfungsfragen in Mainz“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- abbreviation-09 „AGBGB NSH.“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-09 „Gesetz zur Änderung dienstrechtlicher Vorschriften“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-10 „Bekanntmachung über das Inkrafttreten des Abkommens über das Deutsche Institut für Bautechnik (DIBt-Abkommen)“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt

