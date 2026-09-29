# Golden Query Set NSH – Ergebnisse

Stand: 2026-09-29T00:57:27.977Z · 125 Anfragen (data/audits/juris-sh/search/golden-queries.json) · lokale SQLite-Projektion des NSH-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 95.7 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 30.8 | 211.9 | 481.1 |
| and-first | 95.7 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 4.6 | 24.3 | 110.8 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 18 | 100.0 % / 1 / 100.0 % / 0 / 239 | 100.0 % / 1 / 100.0 % / 0 / 9.2 |
| partial-title | 8 | 100.0 % / 0.796 / 100.0 % / 0 / 50 | 100.0 % / 0.796 / 100.0 % / 0 / 12.5 |
| abbreviation | 16 | 100.0 % / 1 / 100.0 % / 0 / 158.9 | 100.0 % / 1 / 100.0 % / 0 / 3.7 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 1.1 | 100.0 % / 1 / 100.0 % / 0 / 0.7 |
| paragraph-address | 15 | 100.0 % / 1 / 100.0 % / 0 / 35.9 | 100.0 % / 1 / 100.0 % / 0 / 21.1 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 481.1 | 100.0 % / 1 / 100.0 % / 0 / 27.9 |
| lrmb-number | 8 | 100.0 % / 1 / – / 0 / 0.9 | 100.0 % / 1 / – / 0 / 0.6 |
| common-word | 5 | – / – / – / 0 / 134.4 | – / – / – / 0 / 110.8 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 137.1 | 100.0 % / 1 / 100.0 % / 0 / 5.6 |
| typo | 5 | 0.0 % / 0 / – / 0 / 6.5 | 0.0 % / 0 / – / 0 / 3.5 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 208.8 | 100.0 % / 1 / 100.0 % / 0 / 9.3 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 231.6 | 100.0 % / 1 / 100.0 % / 0 / 23.1 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 159.5 | 100.0 % / 1 / 100.0 % / 0 / 7 |
| vwv-title | 14 | 100.0 % / 1 / 100.0 % / 0 / 191.5 | 100.0 % / 1 / 100.0 % / 0 / 20.8 |
| federal-reference | 3 | 100.0 % / 1 / – / 0 / 5.8 | 100.0 % / 1 / – / 0 / 5.1 |
| null-result | 4 | – / – / – / 0 / 5.9 | – / – / – / 0 / 0.4 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- vwv-title-01 „Vertretung des Landes Niedersachsen-Holstein im Geschäftsbereich des Ministeriums für Landwirtschaft, ländliche Räume, Europa und Verbraucherschutz (MLLEV)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- long-title-01 „Landesverordnung über die Festsetzung eines Wasserschutzgebietes für die Wassergewinnungsanlagen der Stadtwerke Eckernförde (Wasserschutzgebietsverordnung Eckernförde-Süd)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- partial-title-01 „Änderung Richtlinien Strafverfahren“: or-prefix Rang 1 / 16 gesamt → and-first Rang 1 / 9 gesamt
- partial-title-03 „Änderung Allgemeinen Verfügung“: or-prefix Rang 5 / 134 gesamt → and-first Rang 5 / 58 gesamt
- partial-title-04 „Landesverordnung zuständigen Behörden“: or-prefix Rang 6 / 259 gesamt → and-first Rang 6 / 222 gesamt
- partial-title-05 „Grundsätze Prüfung technischer“: or-prefix Rang 1 / 17 gesamt → and-first Rang 1 / 2 gesamt
- partial-title-07 „Beurlaubungen Abordnungen Beamten“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-01 „7. MAeStV HSH“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-02 „GlueStV 2021“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- paragraph-address-01 „§ 3 IZG-NSH“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 6 gesamt
- article-address-02 „Art. 1 Gesetz zu dem Abkommen zur Änderung des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische Prüfungsfragen in Mainz“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- abbreviation-09 „AGBGB NSH.“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-09 „Gesetz zur Änderung dienstrechtlicher Vorschriften“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-10 „Bekanntmachung über das Inkrafttreten des Abkommens über das Deutsche Institut für Bautechnik (DIBt-Abkommen)“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt

