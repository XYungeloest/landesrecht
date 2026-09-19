# Golden Query Set NSH – Ergebnisse

Stand: 2026-09-19T15:16:07.479Z · 124 Anfragen (data/audits/juris-sh/search/golden-queries.json) · lokale SQLite-Projektion des NSH-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 95.6 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 23.8 | 201.8 | 456.9 |
| and-first | 95.6 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 4.3 | 23.1 | 77.4 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 18 | 100.0 % / 1 / 100.0 % / 0 / 203.6 | 100.0 % / 1 / 100.0 % / 0 / 10.1 |
| partial-title | 8 | 100.0 % / 0.8 / 100.0 % / 0 / 42.1 | 100.0 % / 0.8 / 100.0 % / 0 / 10.3 |
| abbreviation | 16 | 100.0 % / 1 / 100.0 % / 0 / 141.2 | 100.0 % / 1 / 100.0 % / 0 / 3.6 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 1 | 100.0 % / 1 / 100.0 % / 0 / 0.7 |
| paragraph-address | 15 | 100.0 % / 1 / 100.0 % / 0 / 35.1 | 100.0 % / 1 / 100.0 % / 0 / 20.4 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 456.9 | 100.0 % / 1 / 100.0 % / 0 / 29.6 |
| lrmb-number | 8 | 100.0 % / 1 / – / 0 / 1.2 | 100.0 % / 1 / – / 0 / 1 |
| common-word | 5 | – / – / – / 0 / 103.7 | – / – / – / 0 / 77.4 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 133.7 | 100.0 % / 1 / 100.0 % / 0 / 6.6 |
| typo | 5 | 0.0 % / 0 / – / 0 / 6.5 | 0.0 % / 0 / – / 0 / 3.6 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 202.6 | 100.0 % / 1 / 100.0 % / 0 / 11.2 |
| long-title | 3 | 100.0 % / 1 / 100.0 % / 0 / 161.8 | 100.0 % / 1 / 100.0 % / 0 / 23.1 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 157.1 | 100.0 % / 1 / 100.0 % / 0 / 7 |
| vwv-title | 14 | 100.0 % / 1 / 100.0 % / 0 / 234.5 | 100.0 % / 1 / 100.0 % / 0 / 18.8 |
| federal-reference | 3 | 100.0 % / 1 / – / 0 / 4.3 | 100.0 % / 1 / – / 0 / 4.3 |
| null-result | 4 | – / – / – / 0 / 6.3 | – / – / – / 0 / 0.4 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- vwv-title-01 „Vertretung des Landes Niedersachsen-Holstein im Geschäftsbereich des Ministeriums für Landwirtschaft, ländliche Räume, Europa und Verbraucherschutz (MLLEV)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- long-title-01 „Landesverordnung über die Festsetzung eines Wasserschutzgebietes für die Wassergewinnungsanlagen der Stadtwerke Eckernförde (Wasserschutzgebietsverordnung Eckernförde-Süd)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- partial-title-01 „Änderung Richtlinien Strafverfahren“: or-prefix Rang 1 / 16 gesamt → and-first Rang 1 / 9 gesamt
- partial-title-03 „Änderung Allgemeinen Verfügung“: or-prefix Rang 5 / 117 gesamt → and-first Rang 5 / 53 gesamt
- partial-title-04 „Landesverordnung zuständigen Behörden“: or-prefix Rang 5 / 228 gesamt → and-first Rang 5 / 196 gesamt
- partial-title-05 „Grundsätze Prüfung technischer“: or-prefix Rang 1 / 14 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-01 „7. MAeStV HSH“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-02 „GlueStV 2021“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- paragraph-address-01 „§ 3 IZG-NSH“: or-prefix Rang 1 / 7 gesamt → and-first Rang 1 / 6 gesamt
- article-address-02 „Art. 1 Gesetz zu dem Abkommen zur Änderung des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische Prüfungsfragen in Mainz“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- abbreviation-09 „AGBGB NSH.“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-09 „Gesetz zur Änderung dienstrechtlicher Vorschriften“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-10 „Bekanntmachung über das Inkrafttreten des Abkommens über das Deutsche Institut für Bautechnik (DIBt-Abkommen)“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt

