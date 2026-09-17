# Externe RECHT.NRW-Adressen – Stichprobe

Erzeugt mit `npm run audit:external-urls` (höchstens 30 Abrufe, 1500 ms Mindestabstand, nur Statuscode). Grundgesamtheit:
3522 eindeutige Quellen-URLs des West-Bestands (1699 Portalseiten, 1785 PDFs, 38 Ministerialblatt-Einträge).
Stichprobe: gleichmäßig jede k-te Adresse der sortierten Listen (18 Portalseiten, 9 PDFs, 3 Ministerialblatt).

**Einordnung:** Das R2-Archiv (bucket landesrecht-quellen, objectKey/sha256 je Quellenreferenz) ist das kanonische Evidenzarchiv. Ein heutiger 404/3xx der Portaladresse macht die übernommene Norm nicht ungültig; die Portaladresse dokumentiert nur die Herkunft zum Abrufzeitpunkt.

## Statusverteilung

| Status | Anzahl |
| --- | --- |
| 200 | 30 |

Statuscodes: 200 erreichbar; 301/302/307/308 Weiterleitung (nicht gefolgt); 404 nicht (mehr) unter dieser Adresse; 0 Netzfehler/Timeout.

## Abrufe (30)

| Status | Methode | ms | Art | URL | Normen |
| --- | --- | --- | --- | --- | --- |
| 200 | HEAD | 209 | portal-page | https://recht.nrw.de/lrgv/gesetz/01012000-bekanntmachung-der-neufassung-des-gesetzes-ueber-die-sonn-und-feiertage/ | bekanntmachung-der-neufassung-des-gesetzes-ueber-die-sonn-und-feiertage-west |
| 200 | HEAD | 142 | portal-page | https://recht.nrw.de/lrgv/gesetz/01012002-zusammenfuehrung-der-maerkischen-fachhochschule-iserlohn-mit-den-abteilungen/ | zusammenfuehrung-der-maerkischen-fachhochschule-in-iserlohn-mit-den-west |
| 200 | HEAD | 142 | portal-page | https://recht.nrw.de/lrgv/gesetz/01072021-gesetz-ueber-die-zulassung-oeffentlicher-spielbanken-im-land-nordrhein/ | spielbg-west |
| 200 | HEAD | 142 | portal-page | https://recht.nrw.de/lrgv/gesetz/14032022-gesetz-ueber-die-architektenkammer-nordrhein-westfalen-und-die-ingenieurkammer/ | gesetz-ueber-die-architektenkammer-westdeutschland-und-die-west |
| 200 | HEAD | 145 | portal-page | https://recht.nrw.de/lrgv/gesetz/19042017-gesetz-ueber-das-verfahren-bei-volksinitiative-volksbegehren-und/ | vivbveg-west |
| 200 | HEAD | 157 | portal-page | https://recht.nrw.de/lrgv/gesetz/31012023-wohn-und-teilhabegesetz-wtg/ | wtg-west |
| 200 | HEAD | 149 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/01012019-verordnung-zur-durchfuehrung-des-unterhaltsvorschussgesetzes-uvg/ | uvgdvo-west |
| 200 | HEAD | 155 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/01072016-verordnung-zur-verwendung-von-gebaerdensprache-und-anderen/ | khv-west |
| 200 | HEAD | 134 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/05052023-verordnung-ueber-die-abrechnung-der-fallbezogenen/ | landeskrebsregister-abrechnungs-verordnung-west |
| 200 | HEAD | 144 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/13082020-hebammengebuehrenordnung-nordrhein-westfalen-hebgo-nrw/ | hebgo-west |
| 200 | HEAD | 153 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/17122014-verordnung-ueber-die-gewaehrung-von-zulagen-fuer-lehrkraefte-mit/ | verordnung-ueber-die-gewaehrung-von-zulagen-fuer-lehrkraefte-mit-west |
| 200 | HEAD | 140 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/21112018-verordnung-zur-uebertragung-von-befugnissen-nach-den-ssss-57-bis-59/ | verordnung-zur-uebertragung-von-befugnissen-nach-den-57-bis-59-der-west-30931 |
| 200 | HEAD | 140 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/28012021-verordnung-zum-studiumsqualitaetsgesetz-studiumsqualitaetsverordnung/ | studiumsqualitaetsverordnung-west |
| 200 | HEAD | 152 | portal-page | https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012017-richtlinie-ueber-die-gewaehrung-von-zuwendungen-betreiber-von/ | richtlinie-ueber-die-gewaehrung-von-zuwendungen-an-betreiber-von-faehren-west |
| 200 | HEAD | 154 | portal-page | https://recht.nrw.de/lrmb/verwaltungsvorschrift/11072019-richtlinien-fuer-die-anerkennung-von-geeigneten-stellen-nach-ss/ | richtlinien-fuer-die-anerkennung-von-geeigneten-stellen-nach-305-der-west |
| 200 | HEAD | 141 | portal-page | https://recht.nrw.de/lrmb/verwaltungsvorschrift/28082015-richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-0/ | richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-west |
| 200 | HEAD | 155 | portal-page | https://recht.nrw.de/system/files/BH/24004-26254.htm | fa-zvo-west |
| 200 | HEAD | 143 | portal-page | https://recht.nrw.de/system/files/BH/43864-26204.htm | hdvo-west |
| 200 | HEAD | 150 | pdf | https://recht.nrw.de/system/files/2026-03/lrgv_uvpg_29122021_anlage1_0.pdf | uvpg-west |
| 200 | HEAD | 143 | pdf | https://recht.nrw.de/system/files/BA/32784-29862-sgv_203015_20151120_1_anlage.pdf | verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahnen-des-west |
| 200 | HEAD | 142 | pdf | https://recht.nrw.de/system/files/BA/45527-42721-sgv_221_20210504_1_anlage.pdf | gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-voraussetzungen-zur-west |
| 200 | HEAD | 139 | pdf | https://recht.nrw.de/system/files/BA/52380-50037-sgv_29_20231026_1_anlage3.pdf | verordnung-ueber-den-finanziellen-ausgleich-nach-8-zensusgesetz-2022-west |
| 200 | HEAD | 130 | pdf | https://recht.nrw.de/system/files/BHA/25523-40494-sgv_2124_20091215_1_anlage3.pdf | wbvo-pflege-west |
| 200 | HEAD | 146 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2004/07/12/4a2d9c/2022-02-19-gesetz-ueber-das-friedhofs-und-bestattu.pdf | bestg-west |
| 200 | HEAD | 134 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2004/07/12/bee803/2014-12-31-verordnung-ueber-die-durchfuehrung-des-.pdf | dv-agrstatg-west |
| 200 | HEAD | 138 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2008/12/30/a73486/2009-07-18-verordnung-zur-durchfuehrung-des-kirche.pdf | kistgdv-west |
| 200 | HEAD | 131 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2017/03/07/a04775/2017-03-04-dienstordnung-fuer-die-dienstordnungs-a.pdf | dienstordnung-fuer-die-dienstordnungs-angestellten-der-unfallkasse-west |
| 200 | HEAD | 149 | gazette | https://recht.nrw.de/mblnrw/2016-s419/ | kosten-des-brandschutzes-ersatz-von-aufwendungen-bei-teilnahme-von-west |
| 200 | HEAD | 144 | gazette | https://recht.nrw.de/mblnrw/2020-s882-1/ | richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-west |
| 200 | HEAD | 151 | gazette | https://recht.nrw.de/mblnrw/2022-s904/ | notifizierung-von-stellen-fuer-die-untersuchung-von-abfaellen-west |
