# Externe RECHT.NRW-Adressen – Stichprobe

Erzeugt mit `npm run audit:external-urls` (höchstens 30 Abrufe, 1500 ms Mindestabstand, nur Statuscode). Grundgesamtheit:
3695 eindeutige Quellen-URLs des West-Bestands (1772 Portalseiten, 1854 PDFs, 69 Ministerialblatt-Einträge).
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
| 200 | HEAD | 225 | portal-page | https://recht.nrw.de/lrgv/gesetz/01012000-ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-0/ | ausfuehrungsgesetz-zum-buergerlichen-gesetzbuch-west-29214 |
| 200 | HEAD | 134 | portal-page | https://recht.nrw.de/lrgv/gesetz/01012005-gesetz-ueber-die-durchfuehrung-von-auswahlverfahren-bundesweit/ | auswvfg-west |
| 200 | HEAD | 143 | portal-page | https://recht.nrw.de/lrgv/gesetz/01072021-wohnraumstaerkungsgesetz-wohnstg/ | wohnstg-west |
| 200 | HEAD | 125 | portal-page | https://recht.nrw.de/lrgv/gesetz/14062023-richter-und-staatsanwaeltegesetz-fuer-das-land-nordrhein-westfalen/ | lristag-west |
| 200 | HEAD | 168 | portal-page | https://recht.nrw.de/lrgv/gesetz/21102009-gesetz-zur-ausfuehrung-des-sozialgerichtsgesetzes-im-lande-nordrhein-westfalen/ | ag-sgg-west |
| 200 | HEAD | 135 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/01012000-pruefungsordnung-fuer-die-durchfuehrung-von-abschluss-und/ | pruefungsordnung-fuer-die-durchfuehrung-von-abschluss-und-west |
| 200 | HEAD | 148 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/01012021-verordnung-zur-erhebung-der-studienerfolgsstatistik-hochschulen/ | ects-vo-west |
| 200 | HEAD | 137 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/01082019-verordnung-ueber-die-ausbildung-und-pruefung-der-justizfachwirtinnen/ | apo-jfw-west |
| 200 | HEAD | 135 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/06122014-verordnung-zur-ausfuehrung-des-gesetzes-ueber-die-deutsche/ | dhpolgavo-west |
| 200 | HEAD | 135 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/14122019-verordnung-ueber-die-bevorratung-von-arzneimitteln-und/ | arzneimittelbevorratungsverordnung-west |
| 200 | HEAD | 357 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/19022022-verordnung-ueber-den-betrieb-und-ausgestaltung-des-serviceportals/ | serviceportal-west-verordnung-west |
| 200 | HEAD | 126 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/23102019-verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des/ | verordnung-zur-verleihung-der-rechte-einer-koerperschaft-des-west-32512 |
| 200 | HEAD | 117 | portal-page | https://recht.nrw.de/lrgv/rechtsverordnung/28082021-verordnung-ueber-die-kapazitaetsermittlung-die-curricularnormwerte/ | kapvo-west |
| 200 | HEAD | 638 | portal-page | https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062023-richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur/ | richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur-foerderung-west-33791 |
| 200 | HEAD | 343 | portal-page | https://recht.nrw.de/lrmb/verwaltungsvorschrift/14032019-krisenmanagement-durch-krisenstaebe-im-lande-nordrhein/ | krisenmanagement-durch-krisenstaebe-im-lande-westdeutschland-bei-west |
| 200 | HEAD | 127 | portal-page | https://recht.nrw.de/lrmb/verwaltungsvorschrift/28082015-richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-0/ | richtlinien-ueber-die-gewaehrung-von-zuwendung-zur-erhaltung-west |
| 200 | HEAD | 128 | portal-page | https://recht.nrw.de/system/files/BH/24144-26252.htm | verordnung-zur-bestimmung-der-massgebenden-einwohnerzahl-nach-96-absatz-west |
| 200 | HEAD | 439 | portal-page | https://recht.nrw.de/system/files/BH/43907-24467.htm | finasvo-west |
| 200 | HEAD | 121 | pdf | https://recht.nrw.de/system/files/2026-03/lrgv_uvpg_29122021_anlage1_0.pdf | uvpg-west |
| 200 | HEAD | 136 | pdf | https://recht.nrw.de/system/files/BA/3355-43109-sgv_1110_19940714_1_anlage15.pdf | lwahlo-west |
| 200 | HEAD | 864 | pdf | https://recht.nrw.de/system/files/BA/47650-44584-smbl_203205_20211213_a_anlage1.pdf | vvzlrkg-west |
| 200 | HEAD | 123 | pdf | https://recht.nrw.de/system/files/BA/52380-50036-sgv_29_20231026_1_anlage2.pdf | verordnung-ueber-den-finanziellen-ausgleich-nach-8-zensusgesetz-2022-west |
| 200 | HEAD | 128 | pdf | https://recht.nrw.de/system/files/BHA/25523-40499-sgv_2124_20091215_1_anlage8.pdf | wbvo-pflege-west |
| 200 | HEAD | 136 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2004/07/12/3f0e84/2000-01-01-gesetz-zur-neugliederung-der-gemeinden-.pdf | duesseldorf-gesetz-west |
| 200 | HEAD | 635 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2004/07/12/b4df84/2009-12-16-gesetz-ueber-die-gewaehrung-von-unfall-.pdf | gesetz-ueber-die-gewaehrung-von-unfall-und-hinterbliebenenrenten-an-die-west |
| 200 | HEAD | 337 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2008/04/15/099bf4/2016-12-03-verordnung-gem-ss-4-abs-11-des-gesetzes.pdf | verordnung-gem-4-abs-11-des-gesetzes-zur-regelung-der-west |
| 200 | HEAD | 138 | pdf | https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2017/01/27/95a3c6/2021-05-28-verordnung-ueber-die-gewaehrung-von-jub.pdf | jzv-west |
| 200 | HEAD | 138 | gazette | https://recht.nrw.de/mblnrw/2015-s322/ | afp-west |
| 200 | HEAD | 156 | gazette | https://recht.nrw.de/mblnrw/2020-s745-0/ | richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-foerderung-der-west-32502 |
| 200 | HEAD | 133 | gazette | https://recht.nrw.de/mblnrw/2022-s904/ | notifizierung-von-stellen-fuer-die-untersuchung-von-abfaellen-west |
