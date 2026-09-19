# Review-Übersicht juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts audit --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Review-Fälle: **2475** (offen 752). Manifesteinträge: 5195. Kein Fall wurde automatisch entschieden; ein Human Approval oder Freeze findet nicht statt.

| Kategorie | Fälle |
| --- | --- |
| contradictory-evidence | 7 |
| historical-gap | 97 |
| import-regression | 143 |
| incomplete-annex | 610 |
| institution-mapping | 562 |
| pdf-only | 293 |
| reconstruction-required | 68 |
| unknown-structure | 596 |
| validity | 99 |

## Konsistenzprüfung

| Prüfung | Ergebnis | Detail |
| --- | --- | --- |
| enumeration-landesrecht | ok | 2808 Einträge, Fingerabdruck 7a0460777bbb… |
| enumeration-vwv | ok | 2389 Einträge, Fingerabdruck 8ab1f8eef243… |
| quelleninventar | ok | Fingerabdrücke von Inventar und Enumeration stimmen überein |
| sitemap-belege | ok | SHA-256 der Sitemap-Belege im Cache nachgerechnet |
| probe-belege | ok | 20 Probebelege konsistent |
| bestand | ok | 2383 übernommene Manifesteinträge, 2383 Normverzeichnisse, 7149 Dateien unter content/norms/nsh (erwartet 7149) |
| rohquellen | ok | 7322 Rohquellen (PDF) übernommener Normen im Cache nachgerechnet, 405 Abbildungen aus ihrer PDF-Ausgabe reproduziert |

