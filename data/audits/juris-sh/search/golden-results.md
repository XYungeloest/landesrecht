# Golden Query Set NSH – Ergebnisse

Stand: 2026-09-29T07:32:22.784Z · 125 Anfragen (data/audits/juris-sh/search/golden-queries.json) · lokale SQLite-Projektion des NSH-Bestands · Top-10

| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|---|---|---|---|
| or-prefix | 95.7 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 72.3 | 519.3 | 1163.5 |
| and-first | 95.7 % | 0.942 | 100.0 % | 100.0 % | 100.0 % | 0 | 9.8 | 58.1 | 238.8 |

## Je Kategorie

| Kategorie | n | or-prefix: Recall@10 / MRR / Top-1 / verletzt / p95 ms | and-first: Recall@10 / MRR / Top-1 / verletzt / p95 ms |
|---|---|---|---|
| exact-title | 18 | 100.0 % / 1 / 100.0 % / 0 / 529.7 | 100.0 % / 1 / 100.0 % / 0 / 20.3 |
| partial-title | 8 | 100.0 % / 0.796 / 100.0 % / 0 / 122.4 | 100.0 % / 0.796 / 100.0 % / 0 / 27.8 |
| abbreviation | 16 | 100.0 % / 1 / 100.0 % / 0 / 354.1 | 100.0 % / 1 / 100.0 % / 0 / 7.2 |
| abbreviation-lowercase | 3 | 100.0 % / 1 / 100.0 % / 0 / 2.3 | 100.0 % / 1 / 100.0 % / 0 / 1.5 |
| paragraph-address | 15 | 100.0 % / 1 / 100.0 % / 0 / 97.8 | 100.0 % / 1 / 100.0 % / 0 / 51.6 |
| article-address | 3 | 100.0 % / 1 / 100.0 % / 0 / 1163.5 | 100.0 % / 1 / 100.0 % / 0 / 72.2 |
| lrmb-number | 8 | 100.0 % / 1 / – / 0 / 1.8 | 100.0 % / 1 / – / 0 / 1.3 |
| common-word | 5 | – / – / – / 0 / 326.7 | – / – / – / 0 / 238.8 |
| umlaut-variant | 9 | 100.0 % / 1 / 100.0 % / 0 / 337.4 | 100.0 % / 1 / 100.0 % / 0 / 13.2 |
| typo | 5 | 0.0 % / 0 / – / 0 / 14.2 | 0.0 % / 0 / – / 0 / 7.7 |
| similar-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 527.5 | 100.0 % / 1 / 100.0 % / 0 / 20.9 |
| long-title | 4 | 100.0 % / 1 / 100.0 % / 0 / 573.9 | 100.0 % / 1 / 100.0 % / 0 / 55.6 |
| verordnung-title | 5 | 100.0 % / 1 / 100.0 % / 0 / 390.7 | 100.0 % / 1 / 100.0 % / 0 / 14.1 |
| vwv-title | 14 | 100.0 % / 1 / 100.0 % / 0 / 591.5 | 100.0 % / 1 / 100.0 % / 0 / 40.5 |
| federal-reference | 3 | 100.0 % / 1 / – / 0 / 12 | 100.0 % / 1 / – / 0 / 11.4 |
| null-result | 4 | – / – / – / 0 / 16 | – / – / – / 0 / 0.8 |

## Verletzte Erwartungen

keine

## Unterschiede zwischen den Modi (Rang oder Trefferzahl)

- vwv-title-01 „Vertretung des Landes Niedersachsen-Holstein im Geschäftsbereich des Ministeriums für Landwirtschaft, ländliche Räume, Europa und Verbraucherschutz (MLLEV)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- long-title-01 „Landesverordnung über die Festsetzung eines Wasserschutzgebietes für die Wassergewinnungsanlagen der Stadtwerke Eckernförde (Wasserschutzgebietsverordnung Eckernförde-Süd)“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- partial-title-01 „Änderung Richtlinien Strafverfahren“: or-prefix Rang 1 / 17 gesamt → and-first Rang 1 / 9 gesamt
- partial-title-03 „Änderung Allgemeinen Verfügung“: or-prefix Rang 5 / 143 gesamt → and-first Rang 5 / 61 gesamt
- partial-title-04 „Landesverordnung zuständigen Behörden“: or-prefix Rang 6 / 264 gesamt → and-first Rang 6 / 224 gesamt
- partial-title-05 „Grundsätze Prüfung technischer“: or-prefix Rang 1 / 18 gesamt → and-first Rang 1 / 2 gesamt
- partial-title-07 „Beurlaubungen Abordnungen Beamten“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-01 „7. MAeStV HSH“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- umlaut-variant-02 „GlueStV 2021“: or-prefix Rang 1 / 6 gesamt → and-first Rang 1 / 5 gesamt
- paragraph-address-01 „§ 3 IZG-NSH“: or-prefix Rang 1 / 8 gesamt → and-first Rang 1 / 6 gesamt
- article-address-02 „Art. 1 Gesetz zu dem Abkommen zur Änderung des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische Prüfungsfragen in Mainz“: or-prefix Rang 1 / 3 gesamt → and-first Rang 1 / 2 gesamt
- abbreviation-09 „AGBGB NSH.“: or-prefix Rang 1 / 2 gesamt → and-first Rang 1 / 1 gesamt
- exact-title-09 „Gesetz zur Änderung dienstrechtlicher Vorschriften“: or-prefix Rang 1 / 5 gesamt → and-first Rang 1 / 2 gesamt
- exact-title-10 „Bekanntmachung über das Inkrafttreten des Abkommens über das Deutsche Institut für Bautechnik (DIBt-Abkommen)“: or-prefix Rang 1 / 4 gesamt → and-first Rang 1 / 3 gesamt

