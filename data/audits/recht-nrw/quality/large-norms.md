# Große Normen – Audit

Erzeugt mit `npm run audit:large-norms` -- --online. Offline-Kennzahlen aus `content/norms/west/**` (geltende Fassung,
Blockzahl rekursiv, Textlänge = Zeichen in text/title/label, Sucheinheiten wie `packages/search`). Online-Prüfung: je Norm ein Seitenabruf und eine
Anfrage an `/api/v1/search` (Abkürzung, sonst erste sechs Titelwörter), höchstens 30 Normen der Vereinigungsmenge der drei Top-20-Listen.
Abrufzeiten sind Momentaufnahmen (nicht deterministisch); alle übrigen Werte sind reproduzierbar.

## Bestand

| Kennzahl | Wert |
| --- | --- |
| Normen | 1423 |
| Blöcke gesamt | 169377 (Median 49, P90 314) |
| Zeichen gesamt | 25819387 (Median 7215, P90 44286) |
| Sucheinheiten gesamt | 23603 |

## Top 20 nach Blöcken

| Norm | Typ | Blöcke | Zeichen | Sucheinheiten | Übersicht | Tabellen | Anlagen | Fußnoten | Tiefe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sbauvo-west | verordnung | 1463 | 247055 | 164 | 219 | 3 | 0 | 71 | 8 |
| schulg-west | gesetz | 1459 | 298505 | 153 | 194 | 0 | 0 | 114 | 6 |
| go-west | gesetz | 1401 | 275284 | 146 | 156 | 0 | 0 | 116 | 5 |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | gesetz | 1396 | 281265 | 58 | 68 | 1 | 1 | 42 | 5 |
| kwahlo-west | verordnung | 1316 | 208474 | 111 | 111 | 1 | 0 | 113 | 4 |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | gesetz | 1296 | 224008 | 104 | 129 | 0 | 0 | 46 | 5 |
| hg-west-31126 | gesetz | 1225 | 374860 | 114 | 134 | 0 | 0 | 82 | 5 |
| heilberg-west | gesetz | 1144 | 184979 | 149 | 149 | 0 | 0 | 209 | 6 |
| lbg-west | gesetz | 1141 | 210901 | 150 | 159 | 1 | 0 | 32 | 6 |
| polg-west | gesetz | 1122 | 163094 | 88 | 108 | 1 | 0 | 59 | 6 |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | gesetz | 1105 | 243731 | 85 | 95 | 1 | 0 | 71 | 5 |
| verordnung-ueber-den-erwerb-der-fachgebundenen-hochschulreife-waehrend-west | verordnung | 1058 | 15515 | 9 | 9 | 2 | 2 | 4 | 4 |
| hg-west | gesetz | 1055 | 233189 | 146 | 158 | 0 | 0 | 103 | 4 |
| lpvg-west | gesetz | 990 | 145522 | 118 | 142 | 2 | 0 | 120 | 7 |
| lbeamtvg-west | gesetz | 988 | 207151 | 121 | 133 | 2 | 0 | 25 | 6 |
| 3-rundfunkaenderungsgesetz-west | gesetz | 979 | 6864 | 3 | 3 | 8 | 0 | 20 | 5 |
| allgemeines-berggesetz-west | gesetz | 969 | 111031 | 232 | 255 | 0 | 0 | 172 | 5 |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | gesetz | 912 | 13909 | 15 | 15 | 18 | 3 | 1 | 4 |
| boa-west | verordnung | 910 | 42406 | 41 | 41 | 14 | 0 | 18 | 5 |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | gesetz | 868 | 197844 | 148 | 197 | 0 | 0 | 62 | 7 |

## Top 20 nach Textlänge

| Norm | Typ | Blöcke | Zeichen | Sucheinheiten | Übersicht | Tabellen | Anlagen | Fußnoten | Tiefe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hg-west-31126 | gesetz | 1225 | 374860 | 114 | 134 | 0 | 0 | 82 | 5 |
| schulg-west | gesetz | 1459 | 298505 | 153 | 194 | 0 | 0 | 114 | 6 |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | gesetz | 1396 | 281265 | 58 | 68 | 1 | 1 | 42 | 5 |
| go-west | gesetz | 1401 | 275284 | 146 | 156 | 0 | 0 | 116 | 5 |
| sbauvo-west | verordnung | 1463 | 247055 | 164 | 219 | 3 | 0 | 71 | 8 |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | gesetz | 1105 | 243731 | 85 | 95 | 1 | 0 | 71 | 5 |
| hg-west | gesetz | 1055 | 233189 | 146 | 158 | 0 | 0 | 103 | 4 |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | gesetz | 1296 | 224008 | 104 | 129 | 0 | 0 | 46 | 5 |
| lbg-west | gesetz | 1141 | 210901 | 150 | 159 | 1 | 0 | 32 | 6 |
| kwahlo-west | verordnung | 1316 | 208474 | 111 | 111 | 1 | 0 | 113 | 4 |
| lbeamtvg-west | gesetz | 988 | 207151 | 121 | 133 | 2 | 0 | 25 | 6 |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | gesetz | 868 | 197844 | 148 | 197 | 0 | 0 | 62 | 7 |
| heilberg-west | gesetz | 1144 | 184979 | 149 | 149 | 0 | 0 | 209 | 6 |
| polg-west | gesetz | 1122 | 163094 | 88 | 108 | 1 | 0 | 59 | 6 |
| lpvg-west | gesetz | 990 | 145522 | 118 | 142 | 2 | 0 | 120 | 7 |
| vwvfg-west | gesetz | 843 | 141111 | 116 | 145 | 0 | 0 | 57 | 6 |
| bvo-west | verordnung | 631 | 138474 | 41 | 41 | 8 | 0 | 45 | 5 |
| ahaftvollzg-west | gesetz | 460 | 137345 | 59 | 59 | 0 | 0 | 61 | 3 |
| stvollzg-west | gesetz | 840 | 133251 | 137 | 158 | 0 | 0 | 56 | 5 |
| gesetz-ueber-den-westdeutschen-rundfunk-koeln-wdr-gesetz-bekanntmachung-west | gesetz | 704 | 133221 | 73 | 73 | 0 | 0 | 67 | 3 |

## Top 20 nach Sucheinheiten

| Norm | Typ | Blöcke | Zeichen | Sucheinheiten | Übersicht | Tabellen | Anlagen | Fußnoten | Tiefe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west | verwaltungsvorschrift | 860 | 79905 | 387 | 461 | 0 | 0 | 0 | 5 |
| allgemeines-berggesetz-west | gesetz | 969 | 111031 | 232 | 255 | 0 | 0 | 172 | 5 |
| wohnraumfoerderbestimmungen-des-landes-westdeutschland-2023-wfb-west | runderlass | 796 | 118040 | 198 | 235 | 0 | 0 | 0 | 6 |
| sbauvo-west | verordnung | 1463 | 247055 | 164 | 219 | 3 | 0 | 71 | 8 |
| schulg-west | gesetz | 1459 | 298505 | 153 | 194 | 0 | 0 | 114 | 6 |
| lbg-west | gesetz | 1141 | 210901 | 150 | 159 | 1 | 0 | 32 | 6 |
| heilberg-west | gesetz | 1144 | 184979 | 149 | 149 | 0 | 0 | 209 | 6 |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | gesetz | 868 | 197844 | 148 | 197 | 0 | 0 | 62 | 7 |
| go-west | gesetz | 1401 | 275284 | 146 | 156 | 0 | 0 | 116 | 5 |
| hg-west | gesetz | 1055 | 233189 | 146 | 158 | 0 | 0 | 103 | 4 |
| stvollzg-west | gesetz | 840 | 133251 | 137 | 158 | 0 | 0 | 56 | 5 |
| lho-west | gesetz | 593 | 101181 | 130 | 133 | 0 | 0 | 1 | 4 |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33748 | foerderrichtlinie | 395 | 103502 | 127 | 137 | 0 | 0 | 0 | 5 |
| ggo-lobpolnrw-west | runderlass | 298 | 37321 | 123 | 157 | 0 | 0 | 0 | 4 |
| lbeamtvg-west | gesetz | 988 | 207151 | 121 | 133 | 2 | 0 | 25 | 6 |
| lpvg-west | gesetz | 990 | 145522 | 118 | 142 | 2 | 0 | 120 | 7 |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west | foerderrichtlinie | 482 | 81373 | 118 | 125 | 0 | 0 | 0 | 5 |
| vwvfg-west | gesetz | 843 | 141111 | 116 | 145 | 0 | 0 | 57 | 6 |
| hg-west-31126 | gesetz | 1225 | 374860 | 114 | 134 | 0 | 0 | 82 | 5 |
| kwahlo-west | verordnung | 1316 | 208474 | 111 | 111 | 1 | 0 | 113 | 4 |

## Online-Prüfung (https://landesrecht.xyungeloestlp.workers.dev, 7 Abrufe)

30 Normen geprüft, 0 mit Befunden; Abrufzeit Median 179 ms, Maximum 339 ms.

| Norm | HTTP | ms | KB | Übersicht (Soll) | fehlende Ziele | Textblöcke (Soll) | Einheiten (Soll) | Ende vorhanden | Suche | Rang | Befunde |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sbauvo-west | 200 | 315 | 539 | 219 (219) | 0 | 1130 (1130) | 150 (150) | ja | ja (2) | 1 |  |
| schulg-west | 200 | 339 | 549 | 194 (194) | 0 | 1139 (1139) | 138 (138) | ja | ja (60) | 1 |  |
| go-west | 200 | 264 | 503 | 156 (156) | 0 | 1094 (1094) | 146 (146) | ja | ja (18) | 1 |  |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | 200 | 266 | 465 | 68 (68) | 0 | 1114 (1114) | 46 (46) | ja | ja (18) | 15 |  |
| kwahlo-west | 200 | 216 | 365 | 111 (111) | 0 | 702 (702) | 111 (111) | ja | ja (1) | 1 |  |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | 200 | 185 | 411 | 129 (129) | 0 | 1119 (1119) | 91 (91) | ja | ja (23) | 12 |  |
| hg-west-31126 | 200 | 182 | 580 | 134 (134) | 0 | 1007 (1007) | 114 (114) | ja | ja (113) | 2 |  |
| heilberg-west | 200 | 193 | 362 | 149 (149) | 0 | 784 (784) | 132 (132) | ja | ja (3) | 1 |  |
| lbg-west | 200 | 181 | 386 | 159 (159) | 0 | 852 (852) | 141 (141) | ja | ja (20) | 1 |  |
| polg-west | 200 | 169 | 313 | 108 (108) | 0 | 626 (626) | 88 (88) | ja | ja (9) | 1 |  |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | 200 | 179 | 379 | 95 (95) | 0 | 560 (560) | 85 (85) | ja | ja (16) | 15 |  |
| verordnung-ueber-den-erwerb-der-fachgebundenen-hochschulreife-waehrend-west | 200 | 113 | 37 | 9 (9) | 0 | 24 (24) | 9 (9) | ja | ja (1) | 1 |  |
| hg-west | 200 | 178 | 430 | 158 (158) | 0 | 788 (788) | 126 (126) | ja | ja (113) | 1 |  |
| lpvg-west | 200 | 186 | 304 | 142 (142) | 0 | 517 (517) | 117 (117) | ja | ja (21) | 1 |  |
| lbeamtvg-west | 200 | 198 | 363 | 133 (133) | 0 | 774 (774) | 109 (109) | ja | ja (1) | 1 |  |
| 3-rundfunkaenderungsgesetz-west | 200 | 165 | 27 | 3 (3) | 0 | 15 (15) | 3 (3) | ja | ja (6) | 1 |  |
| allgemeines-berggesetz-west | 200 | 181 | 304 | 255 (255) | 0 | 541 (541) | 229 (229) | ja | ja (2) | 1 |  |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | 200 | 116 | 37 | 15 (15) | 0 | 45 (45) | 15 (15) | ja | ja (23) | 16 |  |
| boa-west | 200 | 121 | 106 | 41 (41) | 0 | 217 (217) | 41 (41) | ja | ja (1) | 1 |  |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | 200 | 182 | 391 | 197 (197) | 0 | 607 (607) | 127 (127) | ja | ja (2) | 2 |  |
| zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west | 200 | 290 | 223 | 461 (461) | 0 | 398 (398) | 0 (0) | ja | ja (1) | 1 |  |
| vwvfg-west | 200 | 190 | 286 | 145 (145) | 0 | 636 (636) | 115 (115) | ja | ja (29) | 1 |  |
| stvollzg-west | 200 | 162 | 286 | 158 (158) | 0 | 619 (619) | 114 (114) | ja | ja (4) | 1 |  |
| wohnraumfoerderbestimmungen-des-landes-westdeutschland-2023-wfb-west | 200 | 173 | 244 | 235 (235) | 0 | 541 (541) | 0 (0) | ja | ja (1) | 1 |  |
| gesetz-ueber-den-westdeutschen-rundfunk-koeln-wdr-gesetz-bekanntmachung-west | 200 | 174 | 251 | 73 (73) | 0 | 561 (561) | 73 (73) | ja | ja (14) | 10 |  |
| bvo-west | 200 | 150 | 232 | 41 (41) | 0 | 445 (445) | 41 (41) | ja | ja (3) | 1 |  |
| lho-west | 200 | 152 | 225 | 133 (133) | 0 | 457 (457) | 133 (133) | ja | ja (42) | 1 |  |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west | 200 | 141 | 147 | 125 (125) | 0 | 356 (356) | 0 (0) | ja | ja (1) | 1 |  |
| ahaftvollzg-west | 200 | 131 | 213 | 59 (59) | 0 | 339 (339) | 59 (59) | ja | ja (1) | 1 |  |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33748 | 200 | 143 | 170 | 137 (137) | 0 | 258 (258) | 0 (0) | ja | ja (2) | 1 |  |
