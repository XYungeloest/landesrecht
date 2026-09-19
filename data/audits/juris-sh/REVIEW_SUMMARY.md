# Review-Übersicht juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts audit --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Review-Fälle: **2200** (offen 1971). Manifesteinträge: 5195. Kein Fall wurde automatisch entschieden; ein Human Approval oder Freeze findet nicht statt.

| Kategorie | Fälle |
| --- | --- |
| contradictory-evidence | 7 |
| historical-gap | 97 |
| import-regression | 47 |
| incomplete-annex | 478 |
| institution-mapping | 556 |
| pdf-only | 273 |
| reconstruction-required | 68 |
| unknown-structure | 579 |
| validity | 95 |

## Konsistenzprüfung

| Prüfung | Ergebnis | Detail |
| --- | --- | --- |
| enumeration-landesrecht | ok | 2808 Einträge, Fingerabdruck 7a0460777bbb… |
| enumeration-vwv | ok | 2389 Einträge, Fingerabdruck 8ab1f8eef243… |
| quelleninventar | ok | Fingerabdrücke von Inventar und Enumeration stimmen überein |
| sitemap-belege | ok | SHA-256 der Sitemap-Belege im Cache nachgerechnet |
| probe-belege | ok | 20 Probebelege konsistent |
| bestand | ok | 1910 übernommene Manifesteinträge, 1910 Normverzeichnisse, 5730 Dateien unter content/norms/nsh (erwartet 5730) |
| rohquellen | ok | 6098 Rohquellen (PDF) übernommener Normen im Cache nachgerechnet |

