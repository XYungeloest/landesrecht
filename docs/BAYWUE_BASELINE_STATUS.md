# Stand des Stichtagsbestands Bayern-Württemberg

## Status: DEPLOYED (Teilbestand)

**1 582 Normen des bayerischen Landesrechts zum 2023-12-01 sind übergeleitet, archiviert, projiziert
und ausgeliefert** – 1 569, deren heutiger Text belegt der Stichtagstext ist, und 13, deren Stichtagsfassung
durch Rücknahme der einzigen späteren Änderung bewiesen zurückgerechnet ist. Der Stichtagsbestand ist damit
**nicht vollständig**: 506 weitere Normen galten am Stichtag, aber mit einem anderen Wortlaut als heute; sie
fehlen, bis ihre Stichtagsfassung sicher belegt ist.

Von den fünf Stufen des Auftrags trifft genau eine zu:

| Stufe | trifft zu? |
| --- | --- |
| DISCOVERY | überschritten |
| PARSER READY | überschritten |
| BASELINE PARTIAL | beschreibt die Vollständigkeit, nicht den Ausbaustand – siehe unten |
| TECHNICALLY IMPORTED | überschritten |
| **DEPLOYED** | **ja** – Worker siehe `docs/DEPLOYMENT.md`, Remote-D1 identisch mit lokal, R2 verifiziert |

„Deployed“ heißt hier ausdrücklich **nicht** „vollständig“. Der ausgelieferte Bestand ist ein
sicherer Teilbestand im Sinne des Auftrags: Jede enthaltene Norm ist am Stichtag belegt, keine fehlt
unbemerkt, und keine wurde durch eine jüngere Fassung ersetzt.

**Nicht FROZEN.** Das setzt der Nutzer, nicht der Importer.

## Wie groß der Stichtagsbestand ist – und was davon vorliegt

Der heutige Bestand von BAYERN.RECHT ist nicht der Stichtagsbestand. Er enthält Vorschriften, die es
am 2023-12-01 noch nicht gab, und er zeigt geänderte Vorschriften im heutigen Wortlaut.

| | Zahl |
| --- | ---: |
| enumerierte Dokumente | 2 413 |
| davon ausgeschlossen (56 Tarifverträge, 14 bundeseinheitliche Anordnungen) | 70 |
| davon Scope-Prüffall (Bodensee-SchO: eigene Norm oder Anhang) | 1 |
| davon im Scope | 2 342 |
| davon am Stichtag geltend | 2 089 |
| — heutiger Text **ist** der Stichtagstext → **übernommen** | **1 569** |
| — heutiger Text ist der Stichtagstext, aber an der Überleitung hängend (Quell-Tippfehler „Bayerischne“) | 1 |
| — heutiger Text ist jünger, Stichtagsfassung **rückgerechnet** (Rundlauf, belegter Beginn) → **übernommen** | **13** |
| — heutiger Text ist jünger → **Rekonstruktion nötig** | 506 |
| davon Geltung am Stichtag unbestimmt | 14 |
| davon erst nach dem Stichtag erlassen | 239 |
| **Summe der Scope-Dokumente** | **2 342** |

Dazu kommen die **heute fehlenden Stichtagsnormen**: Das Ereignisregister belegt 436 Aufhebungen und
Außerkrafttreten nach dem Stichtag, deren Vorgänger nicht mehr im Portal steht – 407 davon stark
zugeordnet. Diese Normen galten am 2023-12-01 und sind im heutigen Bestand gar nicht enthalten. Sie
sind erfasst, aber noch nicht wiederhergestellt; ihr Text liegt nur in den Verkündungsblättern.

Eine ehrliche Vollständigkeitsangabe ist deshalb: **1 582 von mindestens rund 2 500 Stichtagsnormen.**
Die Untergrenze ergibt sich aus 2 089 heute geführten plus den belegten heute fehlenden; genauer lässt
sie sich erst beziffern, wenn die Vorgänger der Aufhebungen einzeln geprüft sind.

## Was jede übernommene Norm vorweisen kann

Jeder Manifesteintrag trägt einen `decisionTrace`, etwa:

> Die Vorschrift wurde am 1981-08-06 ausgefertigt und ihr gezeigter Text gilt seit 2015-08-01
> unverändert; damit galt genau dieser Text am 2023-12-01.

mit Scope-Entscheidung, Stichtagsklasse, Belegen aus dem XML und der Quell-Prüfsumme. Eine rückgerechnete
Fassung trägt stattdessen etwa:

> Der heutige Text gilt erst seit 2026-07-01 (BayMBl. 2026 Nr. 225); die Fassung davor galt seit 2018-12-01
> und damit am 2023-12-01. Sie wurde durch Rücknahme genau dieser Änderung zurückgerechnet; der Rundlauf
> ergibt byteidentisch den heutigen Text.

dazu `sourceStatus` `reconstructed/reconstructed`, die Änderungsverkündung (und bei einer vorangehenden
Änderung deren Verkündung) als Quellreferenz und als in R2 archiviertes Rohdokument. Methode:
`docs/BAYWUE_RECONSTRUCTION.md`, Übernahmebedingungen: `docs/BAYWUE_HISTORICAL_BASELINE.md` Abschnitt 4.

Jede übernommene Norm hat die Textintegritätsprüfung bestanden (sichtbarer Quelltext gegen kanonischen Text;
Bulk und Inventur benutzen dieselbe Prüfung): im ganzen Korpus 0 `mismatch`, 4 Einzelfälle `review` mit je
einem unerklärten Zahlwort, sichtbar als nicht blockierende Review-Fälle.

## Wo die Lücke herkommt

Zwei Ursachen, beide aus der Quelle:

1. **BAYERN.RECHT führt keine Fassungshistorie.** Das Portal zeigt nur den heutigen Stand. Eine am
   Stichtag geltende, seither geänderte Fassung ist dort nicht abrufbar.
2. **Außer Kraft getretene Vorschriften fehlen ganz.** Was nach dem Stichtag aufgehoben wurde, ist im
   Portal nicht mehr enthalten.

Beides lässt sich nur aus den Verkündungsblättern schließen – durch Rückrechnung der Änderungen
(`docs/BAYWUE_RECONSTRUCTION.md`) und durch Wiederherstellung aufgehobener Vorschriften aus ihrer
Stammfassung. Beides ist Arbeit an einzelnen Normen, nicht an der Pipeline.

## Wie der Teilbestand in der Oberfläche erscheint

Die Oberfläche zeigt die übernommenen Normen. Sie behauptet nirgends Vollständigkeit; die Zahl der
Normen je Land steht auf der Startseite und in der API (`/api/v1/jurisdictions`). Eine ausdrückliche
Kennzeichnung „Teilbestand“ in der Oberfläche gibt es bisher nicht – sie ist eine Entscheidung über
die Darstellung und gehört zu den offenen Punkten.
