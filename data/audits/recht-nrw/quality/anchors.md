# Sprungziele, Fußnoten, Tabellen – Audit

Erzeugt mit `npm run audit:anchors` -- --online. Offline: alle 1482 Normen über die Legal-Core-Funktionen
(`buildAnchorMap`, `buildOutline`), Prüflogik in `scripts/lib/corpus-stats.ts`. Online: deterministische Stichprobe (Seed 20231201) gerenderter Seiten,
je Seite Abgleich der ids mit den erwarteten Ankern, Fußnoten-, Quellhinweis- und Tabellenzahlen sowie Überschriften-/Linktext-Prüfung.

## Offline (alle Normen)

| Kennzahl | Wert |
| --- | --- |
| Sprungziele gesamt | 29704 |
| Einträge der Inhaltsübersicht gesamt | 29704 |
| Normen ohne Inhaltsübersicht (keine Gliederungsblöcke) | 24 |
| Normen mit Gliederungsblöcken ohne Sprungziel | 0 |
| Normen mit Kollisionssuffix-Ankern (`--pfad`) | 113 (1080 Anker) |
| Normen mit positionsbasierten §/Artikel-Ankern | 0 |
| Normen mit Fußnoten / Fußnoten gesamt | 927 / 10601 |
| Normen mit Quellhinweisen (sourceNotes) | 1153 |
| Normen mit doppelten Fußnoten (gleiches Zeichen, gleicher Text) | 150 |
| Normen mit Fußnotenzeichen ohne Definition | 15 |
| fehlerhafte Fußnotenblöcke | 0 |
| Normen mit Tabellen / Tabellen gesamt | 156 / 390 |
| Tabellen ohne Kopfzeile (erste Zeile ohne tableHeaderCell) | 390 |
| Normen mit §-Verweisen oberhalb des eigenen Zählbereichs (Hinweis) | 420 |

Einordnung: Kollisionssuffix-Anker entstehen, wenn dieselbe Gliederungsbezeichnung mehrfach vorkommt (z. B. „Erster Abschnitt“ in
mehreren Teilen); der Legal-Core vergibt dann pfadbasierte, stabile Adressen – funktional korrekt, aber nicht sprechend. Doppelte
Fußnoten sind Fußnotendefinitionen, die der Legacy-Word-Parser an jeder Verweisstelle erneut einbettet (gleiches Zeichen, gleicher
Text); die Quellzählung bleibt in den Quellhinweisen erhalten. Tabellenkopfzellen (`tableHeaderCell`) kommen im gesamten Bestand nicht
vor – die Parser markieren Kopfzeilen nicht; die Website rendert daher keine `<th>`. Der Hinweis zu §-Verweisen (Verweise oberhalb des
eigenen Zählbereichs ohne erkennbaren Normzusatz) ist eine ungeprüfte Heuristik und nur im JSON enthalten.

### Normen ohne Gliederungsblöcke (24)

Keine Inhaltsübersicht, keine Sprungziele, Suche nur über den Ergänzungstext. Bei mehr als 100 Blöcken ist eine nicht erkannte
Gliederung wahrscheinlich (Parserbefund).

| Norm | Typ | Blöcke | Sucheinheiten |
| --- | --- | --- | --- |
| allgemeine-erlaubnis-fuer-kleine-lotterien-und-ausspielungen-west | verwaltungsvorschrift | 35 | 0 |
| ausnahme-von-den-befoerderungsverboten-des-19-absatz-2-nummer-1-und-2-west | verwaltungsvorschrift | 1 | 0 |
| bewerbungsverfahren-fuer-die-wahl-von-gesellschaftlich-relevanten-west | verwaltungsvorschrift | 19 | 0 |
| chemvwv-west | verwaltungsvorschrift | 189 | 0 |
| fortbildungspruefungsordnung-zur-fachwirtin-zum-fachwirt-fuer-ambulante-west | verwaltungsvorschrift | 307 | 0 |
| gesetz-ueber-das-oeffentliche-flaggen-west | gesetz | 6 | 0 |
| gesetz-ueber-die-entsendung-von-mitgliedern-der-personalvertretung-in-west | gesetz | 5 | 0 |
| gesetz-zur-eingliederung-der-versorgungsaemter-in-die-allgemeine-west-29476 | gesetz | 3 | 0 |
| gesetz-zur-ueberleitung-des-beamtenversorgungsrechts-west | gesetz | 23 | 0 |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-vereinigung-der-lbs-west | zustimmungsgesetz | 8 | 0 |
| gewaesserabschnitte-zum-schutz-der-aesche-west | runderlass | 2 | 0 |
| gno-nw-west | verordnung | 11 | 0 |
| kistg-west-29325 | gesetz | 2 | 0 |
| mitteilung-des-innenministers-des-landes-westdeutschland | gesetz | 4 | 0 |
| nichtraucherschutz-in-dienstraeumen-west | runderlass | 14 | 0 |
| ordnung-ueber-das-verfahren-zur-berufung-von-professorinnen-und-west | runderlass | 56 | 0 |
| verordnung-zur-durchfuehrung-des-gesetzes-ueber-die-pruefung-der-wahlen-west | verordnung | 17 | 0 |
| verwaltungsvereinbarung-zur-errichtung-des-promotionskollegs-fuer-west | verwaltungsvorschrift | 380 | 0 |
| we-meldung-west | runderlass | 47 | 0 |
| zustimmung-zum-dreiundzwanzigsten-rundfunkaenderungsstaatsvertrag-west | gesetz | 6 | 0 |
| zustimmung-zum-dritten-medienaenderungsstaatsvertrag-west | gesetz | 9 | 0 |
| zustimmung-zum-einundzwanzigsten-rundfunkaenderungsstaatsvertrag-west | gesetz | 9 | 0 |
| zustimmung-zum-zweiundzwanzigsten-rundfunkaenderungsstaatsvertrag-west | gesetz | 9 | 0 |
| zweite-verordnung-zur-durchfuehrung-der-hinterlegungsordnung-west | verordnung | 5 | 0 |

### Offline-Befunde (245 Normen)

| Norm | ohne Anker | Kollisionsanker | positionsbasiert | doppelte Fußnoten | Fußnoten ohne Definition | fehlerhaft |
| --- | --- | --- | --- | --- | --- | --- |
| abgg-west | 0 |  |  | Fn 4, Fn 15, Fn 16, Fn 8, Fn 10, Fn 6, Fn 13 |  | 0 |
| abnahme-von-baulichen-massnahmen-bei-ingenieurbauwerken-im-sinne-der-din-west | 0 |  |  |  | 1 | 0 |
| ag-tiergesg-tiernebg-west | 0 |  |  | Fn 2, Fn 3, Fn 5 |  | 0 |
| ahaftvollzg-west | 0 |  |  | Fn 3, Fn 4, Fn 5, Fn 2 |  | 0 |
| ahvo-west | 0 | abschnitt-erster--8-0, abschnitt-zweiter--8-1 |  |  |  | 0 |
| akevo-west | 0 |  |  | Fn 5, Fn 3 |  | 0 |
| allgemeines-berggesetz-west | 0 | abschnitt-erster--9, abschnitt-zweiter--10, abschnitt-dritter--11 (+6) |  |  |  | 0 |
| ameg-west | 0 |  |  | Fn 7 |  | 0 |
| anfoevo-west | 0 | teil-1--8, teil-2--9, kapitel-1--9-0 (+5) |  | Fn 2 |  | 0 |
| ao-gs-west | 0 |  |  | Fn 5 |  | 0 |
| ao-sf-west | 0 | teil-erster--10, abschnitt-1--10-0, abschnitt-2--10-1 (+8) |  |  |  | 0 |
| apg-dvo-west | 0 | abschnitt-1--6-0, abschnitt-2--6-1, kapitel-1--10-1 (+10) |  | Fn 7, Fn 2, Fn 6, Fn 3 |  | 0 |
| apg-west | 0 | teil-1--8, teil-2--9 |  | Fn 4, Fn 3, Fn 2 |  | 0 |
| apo-bk-west | 0 | teil-erster--7, abschnitt-1--7-0, abschnitt-2--7-1 (+2) |  | Fn 5, Fn 4, Fn 8, Fn 11, Fn 13, Fn 12, Fn 14, Fn 17 |  | 0 |
| apo-flfs-west | 0 | abschnitt-1--8, abschnitt-2--9, abschnitt-3--10 |  | Fn 2 |  | 0 |
| apo-geoinfotech-west | 0 | teil-1--10, teil-2--11, teil-3--12 (+5) |  |  |  | 0 |
| apo-gost-west | 0 |  |  | Fn 23, Fn 18, Fn 17, Fn 16, Fn 20, Fn 27, Fn 4, Fn 12, Fn 13 |  | 0 |
| apo-jfw-west | 0 | abschnitt-1--13, abschnitt-2--14, abschnitt-3--15 (+6) |  |  |  | 0 |
| apo-wbk-west | 0 |  |  | Fn 10, Fn 26, Fn 17, Fn 11, Fn 7, Fn 15, Fn 21, Fn 25, Fn 23, Fn 18 |  | 0 |
| apvolchem-west | 0 |  |  | Fn 7, Fn 6, Fn 5, Fn 4 |  | 0 |
| apvovetass-west | 0 | teil-1--10, teil-2--11, teil-3--12 (+4) |  |  |  | 0 |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | 0 | abschnitt-erster--6-0, abschnitt-zweiter--6-1, abschnitt-dritter--6-2 (+22) |  | Fn 5, Fn 17 |  | 0 |
| baupavo-west | 0 | teil-1--10, teil-2--11, teil-3--12 (+3) |  |  |  | 0 |
| baupruefvo-west | 0 |  |  | Fn 4, Fn 10, Fn 5, Fn 7, Fn 11, Fn 6 |  | 0 |
| bbig-west-29206 | 0 |  |  | Fn 6, Fn 3, Fn 4, Fn 9, Fn 5, Fn 10 |  | 0 |
| beamtzustv-fm-west | 0 |  |  | Fn 3 |  | 0 |
| bekanntmachung-der-neufassung-des-landesfischereigesetzes-west | 0 |  |  | Fn 12, Fn 11, Fn 4, Fn 13 |  | 0 |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | 0 | abschnitt-1--15-0, abschnitt-2--15-1, abschnitt-3--15-2 (+46) |  |  |  | 0 |
| bgg-west | 0 | abschnitt-1--8, abschnitt-2--9, abschnitt-3--10 (+1) |  |  |  | 0 |
| bhkg-west | 0 | kapitel-1--6-1, kapitel-2--6-2, kapitel-1--7-1 (+19) |  |  |  | 0 |
| bodschaetzerl-west | 0 |  |  |  | 3 | 0 |
| boersvo-west | 0 | teil-1--6, teil-2--7, teil-3--8 (+2) |  |  |  | 0 |
| bvo-west | 0 |  |  | Fn 6, Fn 7, Fn 4, Fn 5, Fn 9, Fn 3, Fn 23, Fn 11, Fn 24, Fn 8 |  | 0 |
| dschg-west | 0 | abschnitt-1--4-0, abschnitt-2--4-1, abschnitt-3--4-2 (+16) |  |  |  | 0 |
| dsg-west | 0 | kapitel-1--5-0, kapitel-2--5-1, kapitel-3--5-2 (+24) |  |  |  | 0 |
| dvo-ljg-west | 0 | kapitel-1--4-0, kapitel-2--4-1, kapitel-3--4-2 |  |  |  | 0 |
| dvozoebvig-west | 0 |  |  | Fn 3, Fn 2 |  | 0 |
| eeg-west | 0 | teil-i--10, teil-ii--11, teil-iii--12 (+9) |  |  |  | 0 |
| egovg-west | 0 |  |  | Fn 11 |  | 0 |
| eigvo-west | 0 |  |  | Fn 6, Fn 7, Fn 3, Fn 10, Fn 5, Fn 4 |  | 0 |
| erschwerniszulagenverordnung-west | 0 |  |  | Fn 2, Fn 3, Fn 8 |  | 0 |
| eu-west-28724 | 0 |  |  | Fn 6, Fn 7 |  | 0 |
| fa-zvo-west | 0 |  |  | Fn 5, Fn 12, Fn 13, Fn 9 |  | 0 |
| fanag-west | 0 | abschnitt-1--12, abschnitt-2--13, abschnitt-3--14 (+4) |  |  |  | 0 |
| feschvo-west | 0 |  |  | Fn 13, Fn 12, Fn 8, Fn 3 |  | 0 |
| ffvo-west | 0 | teil-1--6, teil-2--7, abschnitt-1--7-0 (+4) |  |  |  | 0 |
| finasvo-west | 0 | abschnitt-1--10, abschnitt-2--11, abschnitt-3--12 (+2) |  |  |  | 0 |
| flueag-west | 0 |  |  | Fn 7, Fn 4 |  | 0 |
| frurlv-west | 0 | teil-1--12, teil-2--13, teil-3--14 (+4) |  | Fn 12, Fn 15, Fn 4, Fn 11, Fn 3, Fn 10, Fn 6 |  | 0 |
| gebg-west | 0 |  |  | Fn 11, Fn 7, Fn 5, Fn 10 |  | 0 |
| gesetz-ueber-den-landesverband-lippe-west | 0 |  |  | Fn 3, Fn 6, Fn 10, Fn 9, Fn 2 |  | 0 |
| gesetz-ueber-den-ruhrverband-ruhrverbandsgesetz-ruhrvg-west | 0 |  |  | Fn 2, Fn 7, Fn 12, Fn 10, Fn 4 |  | 0 |
| gesetz-ueber-den-verfassungsgerichtshof-fuer-das-land-westdeutschland | 0 |  |  | Fn 12, Fn 27, Fn 8, Fn 11, Fn 18, Fn 19, Fn 21 |  | 0 |
| gesetz-ueber-den-westdeutschen-rundfunk-koeln-wdr-gesetz-bekanntmachung-west | 0 |  |  | Fn 26, Fn 23, Fn 16, Fn 15, Fn 22, Fn 10, Fn 18, Fn 12, Fn 20, Fn 5, Fn 24, Fn 19, Fn 8 |  | 0 |
| gesetz-ueber-die-architektenkammer-westdeutschland-und-die-west | 0 | abschnitt-1--4-0, abschnitt-2--4-1, teil-1--6 (+8) |  |  |  | 0 |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | 0 | abschnitt-erster--16, abschnitt-zweiter--17, abschnitt-dritter--18 (+8) |  |  |  | 0 |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | 0 |  |  | Fn 11, Fn 14, Fn 5, Fn 10, Fn 6, Fn 7, Fn 12, Fn 8 |  | 0 |
| gesetz-ueber-die-nrw-bank-nrw-bank-g-west | 0 |  |  | Fn 4, Fn 5, Fn 7, Fn 8 |  | 0 |
| gesetz-zum-schutz-vor-luftverunreinigungen-geraeuschen-und-aehnlichen-west | 0 |  |  | Fn 18 |  | 0 |
| gesetz-zur-eingliederung-der-versorgungsaemter-in-die-allgemeine-west | 0 |  |  | Fn 2, Fn 3, Fn 4, Fn 5 |  | 0 |
| gewvollzvo-west | 0 | abschnitt-2--16, abschnitt-3--17, abschnitt-4--18 (+3) |  |  |  | 0 |
| gkg-west | 0 |  |  | Fn 3, Fn 2, Fn 4, Fn 5, Fn 8 |  | 0 |
| glvo-west | 0 | abschnitt-1--10, abschnitt-2--11, abschnitt-3--12 (+2) |  |  |  | 0 |
| go-west | 0 |  |  | Fn 35, Fn 3, Fn 56, Fn 49, Fn 5, Fn 46, Fn 57, Fn 31, Fn 62, Fn 45, Fn 34, Fn 40, Fn 27, Fn 10, Fn 39, Fn 28, Fn 20, Fn 21, Fn 29, Fn 30, Fn 26, Fn 47 |  | 0 |
| gpag-west | 0 |  |  | Fn 3, Fn 4 |  | 0 |
| grundwertvo-west | 0 | abschnitt-1--6-1, abschnitt-2--6-2, abschnitt-3--6-3 (+16) |  |  |  | 0 |
| gvao-west | 0 | abschnitt-1--9, abschnitt-2--10, abschnitt-3--11 (+3) |  |  |  | 0 |
| habgg-west | 0 | abschnitt-erster--7, abschnitt-zweiter--8, abschnitt-dritter--9 (+1) |  |  |  | 0 |
| hasig-west | 0 | teil-1--7, teil-2--8, teil-3--9 (+2) |  |  |  | 0 |
| haushaltsgesetz-2023-west | 0 | abschnitt-2--13, abschnitt-3--14, abschnitt-5--15 (+6) |  |  |  | 0 |
| hdvo-west | 0 |  |  | Fn 8 |  | 0 |
| heilberg-west | 0 | unterabschnitt-1--7-2, unterabschnitt-2--7-3, abschnitt-vi--9 (+2) |  | Fn 25, Fn 3, Fn 14, Fn 21, Fn 30, Fn 29, Fn 26, Fn 7, Fn 6, Fn 12, Fn 20, Fn 15, Fn 17, Fn 22 |  | 0 |
| hg-west | 0 | abschnitt-erster--22, abschnitt-zweiter--23, abschnitt-dritter--24 (+13) |  |  |  | 0 |
| hg-west-31126 | 0 | kapitel-1--161-0, kapitel-2--161-1, kapitel-3--161-2 (+4) |  | Fn 10, Fn 18, Fn 23, Fn 2, Fn 45, Fn 46 |  | 0 |
| hintg-west | 0 | teil-1--10, teil-2--11, teil-3--12 (+3) |  |  |  | 0 |
| hleistbvo-west | 0 |  |  | Fn 5, Fn 7 |  | 0 |
| hntv-west | 0 | teil-1--8, teil-2--9, teil-3--10 (+2) |  |  |  | 0 |
| ifg-west | 0 |  |  | Fn 5, Fn 4, Fn 3 |  | 0 |
| iuag-west | 0 |  |  | Fn 2 |  | 0 |
| jag-west | 0 |  |  | Fn 10, Fn 3, Fn 28, Fn 4, Fn 26, Fn 8 |  | 0 |
| javollzg-west | 0 |  |  | Fn 2, Fn 9, Fn 5 |  | 0 |
| jmstv-west | 0 |  |  | Fn 3, Fn 2 |  | 0 |
| jstvollzg-west | 0 |  |  | Fn 11, Fn 2, Fn 3, Fn 5 |  | 0 |
| justg-west | 0 | abschnitt-1--3-2-0, abschnitt-2--3-2-1, abschnitt-3--3-2-2 (+50) |  | Fn 25, Fn 4, Fn 3, Fn 22, Fn 24, Fn 7, Fn 30, Fn 31, Fn 32, Fn 33, Fn 34, Fn 13, Fn 19, Fn 8, Fn 15, Fn 16 |  | 0 |
| jvollzdsg-west | 0 | abschnitt-1--12, abschnitt-2--13, abschnitt-3--14 (+5) |  | Fn 3 |  | 0 |
| kag-west | 0 |  |  | Fn 15, Fn 18, Fn 2 |  | 0 |
| kapvo-west | 0 |  |  | Fn 2, Fn 6, Fn 7 |  | 0 |
| khgg-west | 0 | abschnitt-i--7, abschnitt-ii--8, abschnitt-iii--9 (+2) |  | Fn 11, Fn 15, Fn 6, Fn 5, Fn 3, Fn 4 |  | 0 |
| khzvv-west | 0 |  |  | Fn 3 |  | 0 |
| kibiz-west | 0 | teil-1--8, teil-2--9, teil-3--10 (+4) |  |  |  | 0 |
| kjfoeg-west | 0 |  |  | Fn 4 |  | 0 |
| kjhg-west | 0 |  |  | Fn 19 |  | 0 |
| kog-west | 0 |  |  | Fn 5, Fn 6, Fn 2 |  | 0 |
| komhvo-west | 0 | teil-1--13, teil-2--14, teil-3--15 (+6) |  |  |  | 0 |
| kommunalwahlgesetz-west | 0 |  |  | Fn 2, Fn 10, Fn 13, Fn 5, Fn 12, Fn 18, Fn 11, Fn 15 |  | 0 |
| kro-west | 0 |  |  | Fn 36, Fn 17, Fn 39, Fn 24, Fn 6, Fn 23, Fn 2, Fn 31, Fn 26 |  | 0 |
| kulturgb-west | 0 | abschnitt-1--6-0, abschnitt-2--6-1, abschnitt-1--8-0 (+15) |  |  |  | 0 |
| kuv-west | 0 |  |  | Fn 7, Fn 8, Fn 11, Fn 4 |  | 0 |
| kwahlo-west | 0 |  |  | Fn 33, Fn 5, Fn 31, Fn 16, Fn 6, Fn 17, Fn 32, Fn 18, Fn 19, Fn 7, Fn 27, Fn 15, Fn 25, Fn 13 |  | 0 |
| labg-west | 0 |  |  | Fn 3, Fn 2 |  | 0 |
| landesbodenschutzgesetz-fuer-das-land-westdeutschland | 0 |  |  | Fn 3, Fn 6, Fn 7, Fn 9 |  | 0 |
| landeskinderschutzgesetz-west | 0 |  |  | Fn 2 |  | 0 |
| landesministergesetz-bekanntmachung-der-neufassung-west | 0 |  |  | Fn 9, Fn 12, Fn 2 |  | 0 |
| landesplanungsgesetz-westdeutschland | 0 |  |  | Fn 20, Fn 10, Fn 5, Fn 15, Fn 24, Fn 16, Fn 22, Fn 12, Fn 21 |  | 0 |
| lbeamtvg-west | 0 | abschnitt-1--15, abschnitt-2--16, abschnitt-3--17 (+9) |  | Fn 3 |  | 0 |
| lbg-west | 0 | abschnitt-1--12, abschnitt-2--13, abschnitt-3--14 (+6) |  | Fn 13, Fn 10, Fn 8, Fn 6, Fn 5, Fn 2 |  | 0 |
| lbtg-west | 0 |  |  | Fn 8, Fn 7 |  | 0 |
| ldg-west | 0 | kapitel-1--5-0, kapitel-2--5-1, kapitel-3--5-2 (+26) |  |  |  | 0 |
| lfbrvg-west | 0 |  |  | Fn 6, Fn 5, Fn 4, Fn 3 |  | 0 |
| lfog-west | 0 |  |  | Fn 32, Fn 9, Fn 12, Fn 7, Fn 43, Fn 33, Fn 14, Fn 25, Fn 37, Fn 44, Fn 40 |  | 0 |
| lgg-west | 0 | abschnitt-i--9, abschnitt-ii--10, abschnitt-iii--11 (+2) |  |  |  | 0 |
| lho-west | 0 |  |  | Fn 12, Fn 9, Fn 7, Fn 8 |  | 0 |
| ljg-west | 0 |  |  | Fn 5, Fn 18, Fn 12, Fn 16, Fn 15, Fn 3, Fn 14, Fn 13, Fn 9 |  | 0 |
| lkrg-west | 0 | abschnitt-1--12, abschnitt-3--13, abschnitt-4--14 (+4) |  |  |  | 0 |
| lkrwg-west | 0 | teil-1--11 |  | Fn 32, Fn 37, Fn 33, Fn 34, Fn 17, Fn 9, Fn 2, Fn 35 |  | 0 |
| lmg-west | 0 | unterabschnitt-1--163-0, unterabschnitt-2--163-1, unterabschnitt-3--163-2 (+5) |  | Fn 28, Fn 14, Fn 19, Fn 20, Fn 22, Fn 18, Fn 29, Fn 30, Fn 17, Fn 15, Fn 25, Fn 27, Fn 23, Fn 9, Fn 13, Fn 6, Fn 10, Fn 16, Fn 12 |  | 0 |
| lnatschg-west | 0 | abschnitt-1--13-0, abschnitt-2--13-1, kapitel-1--20 (+14) |  |  |  | 0 |
| log-west | 0 |  |  | Fn 3, Fn 15 |  | 0 |
| lplg-dvo-west | 0 | kapitel-1--5-0, kapitel-2--5-1, kapitel-1--6-0 (+11) |  |  |  | 0 |
| lpvg-west | 0 | abschnitt-erster--11-0, abschnitt-zweiter--11-1, abschnitt-dritter--11-2 (+5) |  |  |  | 0 |
| lristag-west | 0 | kapitel-1--133-0, abschnitt-1--133-0-0, abschnitt-2--133-0-1 (+6) |  | Fn 6, Fn 2 |  | 0 |
| lstatg-west | 0 | abschnitt-1--9, abschnitt-2--10, abschnitt-3--11 (+3) |  |  |  | 0 |
| lverbo-west | 0 |  |  | Fn 6, Fn 18, Fn 15, Fn 13, Fn 4, Fn 7, Fn 11 |  | 0 |
| lvopol-west | 0 | unterabschnitt-1--6-0, unterabschnitt-2--6-1, abschnitt-1--9 (+5) |  |  |  | 0 |
| lwkg-west | 0 | teil-1--8, teil-2--9, kapitel-1--9-0 (+6) |  |  |  | 0 |
| lzg-west | 0 |  |  | Fn 3 |  | 0 |
| meldduev-west | 0 |  |  | Fn 2, Fn 21, Fn 3 |  | 0 |
| notvo-west | 0 | teil-1--10, teil-2--11, teil-3--12 (+2) |  | Fn 2 |  | 0 |
| nrverbzustvo-west | 0 |  |  | Fn 2 |  | 0 |
| ntv-west | 0 |  |  | Fn 17, Fn 4 |  | 0 |
| obas-west | 0 |  |  | Fn 4, Fn 6, Fn 2, Fn 10 |  | 0 |
| obg-west | 0 |  |  | Fn 3, Fn 22, Fn 12, Fn 9, Fn 21 |  | 0 |
| oebvig-west | 0 | teil-1--6, teil-2--7, teil-3--8 (+2) |  |  |  | 0 |
| oegdg-west | 0 |  |  | Fn 14, Fn 7, Fn 17, Fn 18, Fn 6 |  | 0 |
| oepnvg-west | 0 |  |  | Fn 10, Fn 12, Fn 2, Fn 9, Fn 11, Fn 13, Fn 4 |  | 0 |
| ovp-west | 0 | teil-1--11, teil-2--12, teil-3--13 (+3) |  |  |  | 0 |
| pflfachassaprv-west | 0 | teil-1--9, teil-2--10, teil-3--11 (+2) |  |  |  | 0 |
| pfog-west | 0 |  |  | Fn 7, Fn 3 |  | 0 |
| po-elektro-west | 0 |  |  |  | 2 | 0 |
| po-externe-a-west | 0 |  |  | Fn 5, Fn 16, Fn 9, Fn 12, Fn 8, Fn 14, Fn 2 |  | 0 |
| po-externe-bk-west | 0 |  |  | Fn 7, Fn 11, Fn 9 |  | 0 |
| po-waldorf-west | 0 |  |  | Fn 8, Fn 9, Fn 12, Fn 14, Fn 5 |  | 0 |
| polg-west | 0 | unterabschnitt-erster-titel--15-9, unterabschnitt-dritter-titel--15-11, unterabschnitt-erster--17-0 (+1) |  | Fn 23, Fn 21, Fn 9, Fn 26, Fn 12, Fn 19, Fn 22, Fn 5, Fn 17, Fn 7 |  | 0 |
| pruefkostenverordnung-fuer-die-gesetzliche-krankenversicherung-und-die-west | 0 |  |  | Fn 2, Fn 4 |  | 0 |
| pruefungs-und-schlichtungsverordnung-psvo-west | 0 | teil-1--7, teil-2--8, kapitel-1--8-0 (+6) |  |  |  | 0 |
| pruefvo-west | 0 |  |  | Fn 5, Fn 3 |  | 0 |
| psychkg-west | 0 | abschnitt-i--8, abschnitt-ii--9, abschnitt-iii--10 (+3) |  | Fn 8, Fn 15, Fn 6, Fn 9 |  | 0 |
| qualifizierung-zur-verwaltungsfachangestellten-oder-zum-west | 0 | teil-1--5, teil-2--6 |  |  |  | 0 |
| ravg-nw-west | 0 |  |  | Fn 3, Fn 2, Fn 10 |  | 0 |
| registervo-west | 0 |  |  | Fn 4 |  | 0 |
| rettaprvo-west | 0 | abschnitt-1--8, abschnitt-2--9, abschnitt-3--10 (+2) |  |  |  | 0 |
| richtlinie-des-landes-zur-kofinanzierung-des-bundesprogramms-foerderung-west | 0 |  |  |  | 6 | 0 |
| richtlinie-des-landes-zur-kofinanzierung-des-bundesprogramms-foerderung-west-33925 | 0 |  |  |  | 3 | 0 |
| richtlinie-fuer-die-anerkennung-von-betreuungsvereinen-sowie-fuer-die-west | 0 | abschnitt-1--1-1, abschnitt-2--1-2, abschnitt-3--1-3 (+1) |  |  |  | 0 |
| richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur-foerderung-west-33791 | 0 |  |  |  | 1 | 0 |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west | 0 |  |  |  | 4 | 0 |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west-33531 | 0 |  |  |  | 4 | 0 |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west-33758 | 0 |  |  |  | 1 | 0 |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33617 | 0 |  |  |  | 3, 4 | 0 |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33748 | 0 |  |  |  | 3, 4 | 0 |
| richtlinie-zur-foerderung-der-modernisierung-von-wohnraum-im-land-west | 0 |  |  |  | 2 | 0 |
| richtlinien-zur-foerderung-der-sommerweidehaltung-west | 0 |  |  |  | 1 | 0 |
| rifog-west | 0 |  |  | Fn 5, Fn 6 |  | 0 |
| rpflao-west | 0 | abschnitt-1--12, abschnitt-2--13, abschnitt-3--14 (+4) |  |  |  | 0 |
| rvrg-west | 0 |  |  | Fn 2, Fn 7, Fn 11, Fn 12, Fn 4, Fn 6, Fn 15, Fn 10, Fn 3 |  | 0 |
| sbauvo-west | 0 | abschnitt-1--4-2-0, abschnitt-2--4-2-1, abschnitt-1--4-3-0 (+49) |  |  |  | 0 |
| schag-west | 0 | abschnitt-erster--3 |  | Fn 14, Fn 3, Fn 4, Fn 19, Fn 21, Fn 5 |  | 0 |
| schulg-west | 0 | abschnitt-erster--3-0, abschnitt-zweiter--3-1, abschnitt-erster--6-0 (+37) |  | Fn 37, Fn 28, Fn 18, Fn 10, Fn 26, Fn 38, Fn 34, Fn 22, Fn 35, Fn 5, Fn 6, Fn 15, Fn 9, Fn 32, Fn 33 |  | 0 |
| spielbg-west | 0 | teil-1--7, teil-2--8, teil-3--9 (+2) |  | Fn 3 |  | 0 |
| spkg-west | 0 |  |  | Fn 4, Fn 6, Fn 2 |  | 0 |
| stbvg-nw-west | 0 |  |  | Fn 4, Fn 7 |  | 0 |
| stiftg-west | 0 | abschnitt-1--7, abschnitt-2--8, abschnitt-3--9 (+2) |  |  |  | 0 |
| strug-west | 0 | abschnitt-1--16, abschnitt-2--17, abschnitt-3--18 (+9) |  |  |  | 0 |
| strwg-west | 0 |  |  | Fn 15, Fn 20, Fn 5, Fn 16, Fn 13, Fn 9, Fn 14, Fn 17, Fn 4 |  | 0 |
| strwmpruefungsr-west | 0 | kapitel-1--15, kapitel-2--16, kapitel-3--17 (+7) |  |  |  | 0 |
| stvollzg-west | 0 | abschnitt-1--27, abschnitt-2--28, abschnitt-3--29 (+18) |  | Fn 23, Fn 14, Fn 3, Fn 30, Fn 32, Fn 38, Fn 13 |  | 0 |
| su-bodav-west | 0 | abschnitt-erster--7-0, abschnitt-zweiter--7-1, teil-erster--9 (+8) |  |  |  | 0 |
| sv-vo-west | 0 |  |  | Fn 7, Fn 6 |  | 0 |
| svvollzg-west | 0 |  |  | Fn 3, Fn 15, Fn 23, Fn 12, Fn 27, Fn 14 |  | 0 |
| tintg-west | 0 | teil-1--10, teil-2--11, teil-3--12 (+1) |  |  |  | 0 |
| tsbekvo-west | 0 |  |  | Fn 7, Fn 12 |  | 0 |
| ukvo-west | 0 |  |  | Fn 6, Fn 3, Fn 2 |  | 0 |
| uteilnahmedatvo-west | 0 |  |  | Fn 3 | 9 | 0 |
| uvollzg-west | 0 | abschnitt-1--16, abschnitt-2--17, abschnitt-4--18 (+1) |  | Fn 2, Fn 11, Fn 7 |  | 0 |
| vap-archd-west | 0 | teil-1--7, teil-2--8, teil-3--9 (+1) |  |  |  | 0 |
| vap1-2-west | 0 | kapitel-1--9-0, kapitel-2--9-1, teil-1--11 (+9) |  |  |  | 0 |
| vap2-1-feu-west | 0 | teil-1--9, teil-2--10, kapitel-1--10-0 (+4) |  |  |  | 0 |
| verfassung-fuer-das-land-westdeutschland | 0 | abschnitt-erster--6-0, abschnitt-zweiter--6-1, abschnitt-dritter--6-2 (+1) |  |  |  | 0 |
| vergabevo-west | 0 | kapitel-1--12, kapitel-2--13, abschnitt-1--13-0 (+11) |  |  |  | 0 |
| verordnung-ueber-den-finanziellen-ausgleich-des-gesetzes-zur-west | 0 |  |  | Fn 6, Fn 4 |  | 0 |
| verordnung-ueber-die-ausbildung-und-die-abschlusspruefungen-in-der-west | 0 | abschnitt-1--13, abschnitt-2--14, abschnitt-3--15 (+3) |  | Fn 18, Fn 17, Fn 19, Fn 24, Fn 3, Fn 21, Fn 15 |  | 0 |
| verordnung-ueber-die-ausbildung-und-die-ii-fachpruefung-fuer-den-west | 0 | teil-1--9, teil-2--10, teil-3--11 (+3) |  |  |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-der-west | 0 |  |  | Fn 3, Fn 4 |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-29682 | 0 |  |  | Fn 3, Fn 8, Fn 5, Fn 6, Fn 7, Fn 11 |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-30018 | 0 |  |  | Fn 4, Fn 8, Fn 3, Fn 6, Fn 10 |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-30286 | 0 |  |  | Fn 4, Fn 9, Fn 14 |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-32344 | 0 | teil-1--7, teil-2--8, teil-3--9 (+1) |  |  |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-32379 | 0 | teil-1--7, teil-2--8, teil-3--9 (+1) |  |  |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-33321 | 0 | teil-2--7, teil-3--8, teil-4--9 |  |  |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-33702 | 0 | teil-1--7, teil-2--8, teil-3--9 (+1) |  |  |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der-west | 0 |  |  | Fn 11, Fn 5, Fn 10, Fn 2 |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der-west-27264 | 0 |  |  | Fn 7, Fn 8 |  | 0 |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-des-west-33113 | 0 | teil-1--7, teil-2--8, teil-5--10 |  | Fn 18 |  | 0 |
| verordnung-ueber-die-berufliche-entwicklung-durch-qualifizierung-west | 0 | teil-1--6, teil-3--7 |  | Fn 2 |  | 0 |
| verordnung-ueber-die-berufliche-entwicklung-durch-qualifizierung-west-31164 | 0 | teil-1--7, teil-2--8, kapitel-1--8-0 (+2) |  |  |  | 0 |
| verordnung-ueber-die-bildung-von-regierungsbezirksuebergreifenden-west | 0 |  |  | Fn 5 |  | 0 |
| verordnung-ueber-die-ermittlungspersonen-der-staatsanwaltschaft-west | 0 |  |  | Fn 3, Fn 5 |  | 0 |
| verordnung-ueber-die-externenpruefung-zum-erwerb-der-abschluesse-der-west | 0 |  |  | Fn 5, Fn 3 |  | 0 |
| verordnung-ueber-die-grundbuchmaessige-behandlung-der-west | 0 |  |  | Fn 5, Fn 6 |  | 0 |
| verordnung-ueber-die-zustaendigkeit-der-amtsgerichte-in-strafsachen-west | 0 |  |  | Fn 4, Fn 8, Fn 3 |  | 0 |
| verordnung-ueber-zustaendigkeiten-im-anwendungsbereich-des-west | 0 |  |  | Fn 11, Fn 8, Fn 9, Fn 19, Fn 18, Fn 21, Fn 24, Fn 15, Fn 13, Fn 7 |  | 0 |
| verordnung-ueber-zustaendigkeiten-im-bereich-strassenverkehr-und-west | 0 | teil-1--37, teil-2--38, teil-3--39 (+4) |  |  |  | 0 |
| verordnung-ueber-zustaendigkeiten-und-zur-uebertragung-von-west | 0 |  |  | Fn 2 |  | 0 |
| verordnung-zur-ausfuehrung-des-93-abs-2-schulgesetz-vo-zu-93-abs-2-west | 0 |  |  | Fn 12 |  | 0 |
| verordnung-zur-ausfuehrung-des-97-abs-4-schulgesetz-west | 0 | abschnitt-erster--9, abschnitt-zweiter--10, abschnitt-dritter--11 (+1) |  |  |  | 0 |
| verordnung-zur-bestimmung-der-grossen-kreisangehoerigen-staedte-und-der-west | 0 |  |  | Fn 2 |  | 0 |
| verordnung-zur-durchfuehrung-des-waffengesetzes-west | 0 |  |  | Fn 5 |  | 0 |
| verordnung-zur-elektronischen-aktenfuehrung-bei-den-gerichten-der-west-31795 | 0 |  |  | Fn 3 |  | 0 |
| verordnung-zur-errichtung-integrierter-untersuchungsanstalten-fuer-west | 0 |  |  | Fn 5, Fn 10, Fn 3, Fn 4, Fn 6, Fn 8, Fn 7 |  | 0 |
| verordnung-zur-regelung-von-zustaendigkeiten-nach-dem-strassenrecht-und-west | 0 |  |  | Fn 4, Fn 6, Fn 5 |  | 0 |
| versg-west | 0 | teil-1--9, teil-2--10, teil-3--11 (+3) |  |  |  | 0 |
| vkzvkg-west | 0 |  |  | Fn 8, Fn 5, Fn 22, Fn 2, Fn 6, Fn 7 |  | 0 |
| vltg-west | 0 |  |  | Fn 2 |  | 0 |
| vo-vwvg-west | 0 |  |  | Fn 7, Fn 9, Fn 2 |  | 0 |
| vo-zkps-west | 0 | abschnitt-1--7, abschnitt-2--8, abschnitt-3--9 (+1) |  |  |  | 0 |
| vobfw-west | 0 | teil-1--13, teil-2--14, teil-3--15 (+7) |  |  |  | 0 |
| voqualiast-west | 0 |  |  | Fn 2 |  | 0 |
| vv-lhundg-west | 0 | abschnitt-1--2-0, abschnitt-2--2-1, abschnitt-3--2-2 (+2) |  |  |  | 0 |
| vwvfg-west | 0 | teil-i--20, abschnitt-1--20-0, abschnitt-2--20-1 (+16) |  | Fn 28, Fn 15, Fn 8, Fn 11, Fn 6, Fn 19, Fn 7, Fn 25, Fn 10, Fn 12, Fn 14 |  | 0 |
| vwvg-west | 0 | unterabschnitt-erster--11-0, unterabschnitt-zweiter--11-1, unterabschnitt-dritter--11-2 |  | Fn 29, Fn 12, Fn 9, Fn 20, Fn 13, Fn 14, Fn 8, Fn 28 |  | 0 |
| wbg-west | 0 | abschnitt-i--18, abschnitt-ii--19, abschnitt-iii--20 (+4) |  |  |  | 0 |
| wbvo-pflege-west | 0 | kapitel-1--4-0, kapitel-2--4-1, kapitel-3--4-2 |  | Fn 9, Fn 11 |  | 0 |
| wfng-west | 0 | teil-1--13, teil-2--14, teil-3--15 (+6) |  |  |  | 0 |
| wo-lpvg-west | 0 | abschnitt-erster--7-0, abschnitt-zweiter--7-1, abschnitt-erster--9-0 (+3) |  |  |  | 0 |
| woaoegw-west | 0 | teil-erster--6, teil-zweiter--7, teil-dritter--8 (+1) |  |  |  | 0 |
| wohnraumfoerderbestimmungen-des-landes-westdeutschland-2023-wfb-west | 0 |  |  |  | 4 | 0 |
| wohnstg-west | 0 | teil-1--7, teil-2--8, teil-3--9 (+2) |  |  |  | 0 |
| wprzoegw-vo-west | 0 | teil-1--7, teil-2--8, teil-3--9 |  |  |  | 0 |
| wpvg-west | 0 |  |  | Fn 3, Fn 7 |  | 0 |
| wtg-dvo-west | 0 | kapitel-1--5-0, kapitel-2--5-1, abschnitt-1--5-1-0 (+27) |  |  |  | 0 |
| wtg-west | 0 | kapitel-1--5-0, kapitel-2--5-1, kapitel-3--5-2 (+13) |  |  |  | 0 |
| zustavo-west | 0 | abschnitt-1--14, abschnitt-2--15, abschnitt-3--16 (+3) |  | Fn 2 |  | 0 |
| zustvo-hb-west | 0 |  |  | Fn 5, Fn 2 |  | 0 |
| zustvovs-west | 0 |  |  | Fn 5 |  | 0 |
| zuvo-sgb-west | 0 |  |  | Fn 2 |  | 0 |

## Online-Stichprobe (https://landesrecht-online.de, 60 Abrufe, 60 Seiten)

Prüfstand ist der abgefragte Server: Änderungen an `apps/web/src` wirken auf der deployten Site erst nach einem Redeploy;
lokale Gegenprüfung mit `npm run audit:anchors -- --online --base-url http://localhost:<port>` (Dev-Server in `apps/web`).

0 von 60 Seiten mit Befunden. Befundarten: keine.

| Norm | HTTP | ms | ids | Übersicht | fehlend | Anker (Soll) | fehlend im HTML | Fußnoten (Soll) | Quellhinweise (Soll) | Tabellen (Soll) | ohne th | Befunde |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ag-vwgo-west | 200 | 349 | 50 | 14 | 0 | 14 | 0 | 20 (20) | 20 (20) | 0 (0) | 0 |  |
| aojw-west | 200 | 146 | 64 | 13 | 0 | 13 | 0 | 2 (2) | 2 (2) | 1 (1) | 1 |  |
| apo-geoinfotech-west | 200 | 182 | 212 | 58 | 0 | 58 | 0 | 36 (36) | 36 (36) | 0 (0) | 0 |  |
| apo-os-west | 200 | 189 | 279 | 47 | 0 | 47 | 0 | 33 (33) | 33 (33) | 1 (1) | 1 |  |
| apvolkon-west | 200 | 149 | 148 | 36 | 0 | 36 | 0 | 8 (8) | 8 (8) | 1 (1) | 1 |  |
| ausbildungs-und-pruefungsordnung-fuer-familienpflegerinnen-und-west | 200 | 208 | 143 | 27 | 0 | 27 | 0 | 5 (5) | 5 (5) | 1 (1) | 1 |  |
| avwgebo-west | 200 | 482 | 27 | 8 | 0 | 8 | 0 | 1 (1) | 2 (2) | 0 (0) | 0 |  |
| azvo-west | 200 | 199 | 112 | 20 | 0 | 20 | 0 | 16 (16) | 16 (16) | 0 (0) | 0 |  |
| blb-west-31302 | 200 | 189 | 163 | 78 | 0 | 78 | 0 | 0 (0) | 2 (2) | 0 (0) | 0 |  |
| boa-west | 200 | 173 | 216 | 41 | 0 | 41 | 0 | 20 (20) | 20 (20) | 14 (14) | 13 |  |
| bvo-west | 200 | 211 | 254 | 41 | 0 | 41 | 0 | 45 (45) | 26 (26) | 8 (8) | 8 |  |
| flulaermmuensterv-west | 200 | 155 | 19 | 5 | 0 | 5 | 0 | 1 (1) | 1 (1) | 0 (0) | 0 |  |
| gesetz-ueber-den-beitritt-des-landes-westdeutschland-zum-abkommen-zur-west | 200 | 148 | 44 | 11 | 0 | 11 | 0 | 2 (2) | 2 (2) | 0 (0) | 0 |  |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | 200 | 347 | 670 | 68 | 0 | 68 | 0 | 46 (46) | 46 (46) | 1 (1) | 1 |  |
| gesetz-ueber-unschaedlichkeitszeugnisse-west | 200 | 136 | 61 | 16 | 0 | 16 | 0 | 5 (5) | 5 (5) | 0 (0) | 0 |  |
| gesetz-zu-dem-vertrag-des-landes-westdeutschland-mit-der-lippischen-west | 200 | 136 | 22 | 4 | 0 | 4 | 0 | 2 (2) | 2 (2) | 1 (1) | 1 |  |
| gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-dem-west | 200 | 153 | 50 | 15 | 0 | 15 | 0 | 16 (16) | 16 (16) | 1 (1) | 1 |  |
| gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-der-west | 200 | 156 | 49 | 12 | 0 | 12 | 0 | 2 (2) | 2 (2) | 9 (9) | 3 |  |
| gesetz-zu-dem-vertrage-des-landes-westdeutschland-mit-der-evangelischen-west | 200 | 135 | 15 | 3 | 0 | 3 | 0 | 1 (1) | 1 (1) | 2 (2) | 0 |  |
| gesetz-zu-der-vereinbarung-zwischen-dem-land-westdeutschland-und-der-west | 200 | 138 | 27 | 7 | 0 | 7 | 0 | 1 (1) | 1 (1) | 0 (0) | 0 |  |
| gesetz-zum-dritten-staatsvertrag-zwischen-den-laendern-niedersachsen-und-west | 200 | 134 | 24 | 6 | 0 | 6 | 0 | 0 (0) | 0 (0) | 1 (1) | 1 |  |
| gesetz-zur-anhebung-der-aemter-von-schulleiterinnen-und-schulleitern-an-west | 200 | 140 | 15 | 3 | 0 | 3 | 0 | 0 (0) | 0 (0) | 0 (0) | 0 |  |
| gesetz-zur-bereinigung-des-in-westdeutschland-geltenden-preussischen-west | 200 | 146 | 24 | 7 | 0 | 7 | 0 | 5 (5) | 5 (5) | 2 (2) | 2 |  |
| gesetz-zur-ergaenzung-des-gesetzes-zur-neugliederung-der-gemeinden-und-west | 200 | 136 | 10 | 2 | 0 | 2 | 0 | 0 (0) | 0 (0) | 0 (0) | 0 |  |
| gewvollzvo-west | 200 | 151 | 129 | 35 | 0 | 35 | 0 | 1 (1) | 1 (1) | 0 (0) | 0 |  |
| gkg-west | 200 | 184 | 205 | 42 | 0 | 42 | 0 | 36 (36) | 14 (14) | 0 (0) | 0 |  |
| jgs-anlagenv-west | 200 | 145 | 48 | 10 | 0 | 10 | 0 | 12 (12) | 12 (12) | 0 (0) | 0 |  |
| jmstv-west | 200 | 174 | 126 | 13 | 0 | 13 | 0 | 33 (33) | 4 (4) | 1 (1) | 1 |  |
| jvkostg-west | 200 | 166 | 26 | 6 | 0 | 6 | 0 | 5 (5) | 5 (5) | 1 (1) | 1 |  |
| kampfmittelvo-west | 200 | 141 | 34 | 7 | 0 | 7 | 0 | 9 (9) | 9 (9) | 0 (0) | 0 |  |
| koeln-gesetz-west | 200 | 221 | 138 | 34 | 0 | 34 | 0 | 3 (3) | 3 (3) | 0 (0) | 0 |  |
| komabwv-west | 200 | 139 | 50 | 14 | 0 | 14 | 0 | 9 (9) | 9 (9) | 1 (1) | 1 |  |
| komhvo-west | 200 | 194 | 351 | 81 | 0 | 81 | 0 | 5 (5) | 5 (5) | 0 (0) | 0 |  |
| landesgueteverordnung-milch-west | 200 | 149 | 44 | 10 | 0 | 10 | 0 | 11 (11) | 11 (11) | 0 (0) | 0 |  |
| lbeamtvg-west | 200 | 296 | 610 | 133 | 0 | 133 | 0 | 25 (25) | 24 (24) | 2 (2) | 2 |  |
| lchemg-west | 200 | 134 | 31 | 6 | 0 | 6 | 0 | 8 (8) | 8 (8) | 0 (0) | 0 |  |
| lnatschg-west | 200 | 220 | 461 | 116 | 0 | 116 | 0 | 8 (8) | 0 (0) | 0 (0) | 0 |  |
| log-west | 200 | 159 | 106 | 28 | 0 | 28 | 0 | 18 (18) | 16 (16) | 1 (1) | 1 |  |
| lristag-west | 200 | 244 | 491 | 128 | 0 | 128 | 0 | 20 (20) | 14 (14) | 1 (1) | 1 |  |
| nkfeg-west | 200 | 146 | 47 | 10 | 0 | 10 | 0 | 1 (1) | 1 (1) | 0 (0) | 0 |  |
| obg-west | 200 | 195 | 205 | 56 | 0 | 56 | 0 | 39 (39) | 24 (24) | 1 (1) | 1 |  |
| oebvermingko-west | 200 | 144 | 41 | 10 | 0 | 10 | 0 | 4 (4) | 4 (4) | 4 (4) | 4 |  |
| ordnungsbehoerdliche-verordnung-ueber-fernleitungen-zum-befoerdern-von-west | 200 | 151 | 63 | 18 | 0 | 18 | 0 | 3 (3) | 3 (3) | 0 (0) | 0 |  |
| preussisches-gesetz-ueber-die-freiwillige-gerichtsbarkeit-west | 200 | 185 | 241 | 86 | 0 | 86 | 0 | 47 (47) | 47 (47) | 0 (0) | 0 |  |
| richtlinie-fuer-kunst-und-bau-bei-herausgehobenen-baumassnahmen-des-west | 200 | 157 | 33 | 13 | 0 | 13 | 0 | 0 (0) | 2 (2) | 0 (0) | 0 |  |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33922 | 200 | 199 | 79 | 36 | 0 | 36 | 0 | 0 (0) | 2 (2) | 0 (0) | 0 |  |
| siebte-verordnung-ueber-die-zuordnung-von-uebertragungskapazitaeten-7-west | 200 | 152 | 23 | 8 | 0 | 8 | 0 | 5 (5) | 5 (5) | 4 (4) | 4 |  |
| spkg-west | 200 | 193 | 244 | 46 | 0 | 46 | 0 | 18 (18) | 9 (9) | 1 (1) | 1 |  |
| staerkungspaktfondsgesetz-west | 200 | 150 | 43 | 12 | 0 | 12 | 0 | 8 (8) | 8 (8) | 0 (0) | 0 |  |
| suschvo-west | 200 | 152 | 52 | 14 | 0 | 14 | 0 | 0 (0) | 0 (0) | 1 (1) | 1 |  |
| verordnung-ueber-bewirtschaftungsbezirke-fuer-rotwild-sikawild-damwild-west | 200 | 158 | 34 | 8 | 0 | 8 | 0 | 2 (2) | 2 (2) | 0 (0) | 0 |  |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-32344 | 200 | 181 | 172 | 37 | 0 | 37 | 0 | 1 (1) | 1 (1) | 0 (0) | 0 |  |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-laufbahn-der-west-27264 | 200 | 164 | 123 | 27 | 0 | 27 | 0 | 13 (13) | 8 (8) | 1 (1) | 1 |  |
| verordnung-ueber-die-durchschnittsbetraege-und-den-eigenanteil-nach-96-west | 200 | 138 | 34 | 7 | 0 | 7 | 0 | 8 (8) | 8 (8) | 4 (4) | 4 |  |
| verordnung-ueber-die-kreispolizeibehoerden-des-landes-westdeutschland | 200 | 139 | 13 | 3 | 0 | 3 | 0 | 4 (4) | 4 (4) | 0 (0) | 0 |  |
| verwgebo-ifg-west | 200 | 130 | 19 | 5 | 0 | 5 | 0 | 3 (3) | 3 (3) | 0 (0) | 0 |  |
| vgtariffavo-west | 200 | 154 | 17 | 4 | 0 | 4 | 0 | 2 (2) | 2 (2) | 0 (0) | 0 |  |
| vivbveg-west-28431 | 200 | 184 | 117 | 33 | 0 | 33 | 0 | 52 (52) | 52 (52) | 0 (0) | 0 |  |
| vwvfg-west | 200 | 249 | 568 | 145 | 0 | 145 | 0 | 57 (57) | 28 (28) | 0 (0) | 0 |  |
| waseg-west | 200 | 141 | 61 | 12 | 0 | 12 | 0 | 9 (9) | 9 (9) | 0 (0) | 0 |  |
