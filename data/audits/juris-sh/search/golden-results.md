# Golden Query Set NSH – Ergebnisse

Stand: 2026-09-19T10:09:30.338Z · 125 Anfragen (data/audits/juris-sh/search/golden-queries.json) · lokale SQLite-Projektion des NSH-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 95.7 % | 0.943 | 100.0 % | 100.0 % | 100.0 % | 0 | 49.8 | 368.4 | 819 |
| and-first | 95.7 % | 0.943 | 100.0 % | 100.0 % | 100.0 % | 0 | 8.1 | 45.1 | 146.4 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 18 | 100.0 % / 1 / 100.0 % / 0 / 370.5 | 100.0 % / 1 / 100.0 % / 0 / 15.9 |
| partial-title | 8 | 100.0 % / 0.8 / 100.0 % / 0 / 78.5 | 100.0 % / 0.8 / 100.0 % / 0 / 19.1 |
| abbreviation | 16 | 100.0 % / 1 / 100.0 % / 0 / 257.6 | 100.0 % / 1 / 100.0 % / 0 / 6.8 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 2.1 | 100.0 % / 1 / 100.0 % / 0 / 1.2 |
| paragraph-address | 15 | 100.0 % / 1 / 100.0 % / 0 / 66.4 | 100.0 % / 1 / 100.0 % / 0 / 39.2 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 819 | 100.0 % / 1 / 100.0 % / 0 / 48.9 |
| lrmb-number | 8 | 100.0 % / 1 / – / 0 / 2 | 100.0 % / 1 / – / 0 / 1.5 |
| common-word | 5 | – / – / – / 0 / 191 | – / – / – / 0 / 146.4 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 243.4 | 100.0 % / 1 / 100.0 % / 0 / 11.8 |
| typo | 5 | 0.0 % / 0 / – / 0 / 12.2 | 0.0 % / 0 / – / 0 / 6.5 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 372.5 | 100.0 % / 1 / 100.0 % / 0 / 17 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 405.2 | 100.0 % / 1 / 100.0 % / 0 / 45.8 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 279.7 | 100.0 % / 1 / 100.0 % / 0 / 11.4 |
| vwv-title | 14 | 100.0 % / 1 / 100.0 % / 0 / 437.6 | 100.0 % / 1 / 100.0 % / 0 / 38.6 |
| federal-reference | 3 | 100.0 % / 1 / – / 0 / 8.2 | 100.0 % / 1 / – / 0 / 8.2 |
| null-result | 4 | – / – / – / 0 / 14 | – / – / – / 0 / 0.7 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- vwv-title-01 „Vertretung des Landes Niedersachsen-Holstein im Geschäftsbereich des Ministeriums für Landwirtschaft, ländliche Räume, Europa und Verbraucherschutz (MLLEV)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- long-title-01 „Landesverordnung über die Festsetzung eines Wasserschutzgebietes für die Wassergewinnungsanlagen der Stadtwerke Eckernförde (Wasserschutzgebietsverordnung Eckernförde-Süd)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- partial-title-01 „Änderung Richtlinien Strafverfahren“: or-prefix Rang 1 / 16 gesamt → and-first Rang 1 / 9 gesamt
- partial-title-03 „Änderung Allgemeinen Verfügung“: or-prefix Rang 5 / 109 gesamt → and-first Rang 5 / 49 gesamt
- partial-title-04 „Landesverordnung zuständigen Behörden“: or-prefix Rang 5 / 226 gesamt → and-first Rang 5 / 194 gesamt
- partial-title-05 „Grundsätze Prüfung technischer“: or-prefix Rang 1 / 11 gesamt → and-first Rang 1 / 3 gesamt
- umlaut-variant-01 „7. MAeStV HSH“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-02 „GlueStV 2021“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- article-address-02 „Art. 1 Gesetz zu dem Abkommen zur Änderung des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische Prüfungsfragen in Mainz“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- abbreviation-09 „AGBGB NSH.“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-09 „Gesetz zur Änderung dienstrechtlicher Vorschriften“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-10 „Bekanntmachung über das Inkrafttreten des Abkommens über das Deutsche Institut für Bautechnik (DIBt-Abkommen)“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt

