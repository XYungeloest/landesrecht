# Review-Übersicht juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts audit --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Review-Fälle: **2516** (offen 1). Manifesteinträge: 5195. Kein Fall wurde automatisch entschieden; ein Human Approval oder Freeze findet nicht statt.

| Kategorie | Fälle |
| --- | --- |
| contradictory-evidence | 7 |
| historical-gap | 97 |
| import-regression | 158 |
| incomplete-annex | 612 |
| institution-mapping | 563 |
| pdf-only | 293 |
| reconstruction-required | 68 |
| unknown-structure | 619 |
| validity | 99 |

## Konsistenzprüfung

| Prüfung | Ergebnis | Detail |
| --- | --- | --- |
| enumeration-landesrecht | ok | 2808 Einträge, Fingerabdruck 7a0460777bbb… |
| enumeration-vwv | ok | 2389 Einträge, Fingerabdruck 8ab1f8eef243… |
| quelleninventar | ok | Fingerabdrücke von Inventar und Enumeration stimmen überein |
| sitemap-belege | ok | SHA-256 der Sitemap-Belege im Cache nachgerechnet |
| probe-belege | ok | 20 Probebelege konsistent |
| bestand | ok | 2672 übernommene Manifesteinträge, 2672 Normverzeichnisse, 8016 Dateien unter content/norms/nsh (erwartet 8016); Sim-Normen 33 (104 Dateien) |
| rohquellen | ok | 11000 Rohquellen (PDF) übernommener Normen im Cache nachgerechnet, 526 Abbildungen aus ihrer PDF-Ausgabe reproduziert |

