# Große Normen – Audit

Erzeugt mit `npm run audit:large-norms` -- --online. Offline-Kennzahlen aus `content/norms/west/**` (geltende Fassung,
Blockzahl rekursiv, Textlänge = Zeichen in text/title/label, Sucheinheiten wie `packages/search`). Online-Prüfung: je Norm ein Seitenabruf und eine
Anfrage an `/api/v1/search` (Abkürzung, sonst erste sechs Titelwörter), höchstens 30 Normen der Vereinigungsmenge der drei Top-20-Listen.
Abrufzeiten sind Momentaufnahmen (nicht deterministisch); alle übrigen Werte sind reproduzierbar.

## Bestand

| Kennzahl | Wert |
| --- | --- |
| Normen | 1482 |
| Blöcke gesamt | 186478 (Median 50, P90 320) |
| Zeichen gesamt | 28643003 (Median 7647, P90 45625) |
| Sucheinheiten gesamt | 26011 |

## Top 20 nach Blöcken

| Norm | Typ | Blöcke | Zeichen | Sucheinheiten | Übersicht | Tabellen | Anlagen | Fußnoten | Tiefe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| avwgebo-west | verordnung | 5871 | 831284 | 8 | 8 | 0 | 2 | 1 | 3 |
| sbauvo-west | verordnung | 1463 | 247053 | 164 | 219 | 3 | 0 | 72 | 8 |
| schulg-west | gesetz | 1460 | 298547 | 154 | 194 | 0 | 0 | 115 | 6 |
| go-west | gesetz | 1442 | 283672 | 146 | 156 | 0 | 0 | 157 | 5 |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | gesetz | 1396 | 281257 | 58 | 68 | 1 | 1 | 46 | 5 |
| kwahlo-west | verordnung | 1320 | 209058 | 111 | 111 | 1 | 0 | 117 | 4 |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | gesetz | 1297 | 224112 | 104 | 129 | 0 | 0 | 47 | 5 |
| hg-west-31126 | gesetz | 1233 | 378252 | 114 | 134 | 0 | 0 | 90 | 5 |
| heilberg-west | gesetz | 1146 | 185523 | 149 | 149 | 0 | 0 | 211 | 6 |
| lbg-west | gesetz | 1146 | 213067 | 151 | 160 | 1 | 0 | 32 | 6 |
| polg-west | gesetz | 1122 | 163094 | 88 | 108 | 1 | 0 | 59 | 6 |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | gesetz | 1119 | 248182 | 85 | 95 | 1 | 0 | 85 | 5 |
| lmg-west | gesetz | 1107 | 222957 | 134 | 156 | 0 | 0 | 133 | 5 |
| verordnung-ueber-den-erwerb-der-fachgebundenen-hochschulreife-waehrend-west | verordnung | 1058 | 15513 | 9 | 9 | 2 | 2 | 5 | 4 |
| hg-west | gesetz | 1055 | 233185 | 146 | 158 | 0 | 0 | 105 | 4 |
| lpvg-west | gesetz | 990 | 145520 | 118 | 142 | 2 | 0 | 121 | 7 |
| lbeamtvg-west | gesetz | 988 | 207151 | 121 | 133 | 2 | 0 | 25 | 6 |
| 3-rundfunkaenderungsgesetz-west | gesetz | 979 | 6864 | 3 | 3 | 8 | 0 | 20 | 5 |
| allgemeines-berggesetz-west | gesetz | 969 | 111019 | 232 | 255 | 0 | 0 | 178 | 5 |
| justg-west | gesetz | 940 | 130133 | 173 | 223 | 0 | 0 | 81 | 7 |

## Top 20 nach Textlänge

| Norm | Typ | Blöcke | Zeichen | Sucheinheiten | Übersicht | Tabellen | Anlagen | Fußnoten | Tiefe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| avwgebo-west | verordnung | 5871 | 831284 | 8 | 8 | 0 | 2 | 1 | 3 |
| hg-west-31126 | gesetz | 1233 | 378252 | 114 | 134 | 0 | 0 | 90 | 5 |
| schulg-west | gesetz | 1460 | 298547 | 154 | 194 | 0 | 0 | 115 | 6 |
| go-west | gesetz | 1442 | 283672 | 146 | 156 | 0 | 0 | 157 | 5 |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | gesetz | 1396 | 281257 | 58 | 68 | 1 | 1 | 46 | 5 |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | gesetz | 1119 | 248182 | 85 | 95 | 1 | 0 | 85 | 5 |
| sbauvo-west | verordnung | 1463 | 247053 | 164 | 219 | 3 | 0 | 72 | 8 |
| hg-west | gesetz | 1055 | 233185 | 146 | 158 | 0 | 0 | 105 | 4 |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | gesetz | 1297 | 224112 | 104 | 129 | 0 | 0 | 47 | 5 |
| lmg-west | gesetz | 1107 | 222957 | 134 | 156 | 0 | 0 | 133 | 5 |
| lbg-west | gesetz | 1146 | 213067 | 151 | 160 | 1 | 0 | 32 | 6 |
| kwahlo-west | verordnung | 1320 | 209058 | 111 | 111 | 1 | 0 | 117 | 4 |
| lbeamtvg-west | gesetz | 988 | 207151 | 121 | 133 | 2 | 0 | 25 | 6 |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | gesetz | 868 | 197842 | 148 | 197 | 0 | 0 | 63 | 7 |
| heilberg-west | gesetz | 1146 | 185523 | 149 | 149 | 0 | 0 | 211 | 6 |
| polg-west | gesetz | 1122 | 163094 | 88 | 108 | 1 | 0 | 59 | 6 |
| lpvg-west | gesetz | 990 | 145520 | 118 | 142 | 2 | 0 | 121 | 7 |
| vwvfg-west | gesetz | 843 | 141111 | 116 | 145 | 0 | 0 | 57 | 6 |
| bvo-west | verordnung | 631 | 138474 | 41 | 41 | 8 | 0 | 45 | 5 |
| ahaftvollzg-west | gesetz | 460 | 137345 | 59 | 59 | 0 | 0 | 61 | 3 |

## Top 20 nach Sucheinheiten

| Norm | Typ | Blöcke | Zeichen | Sucheinheiten | Übersicht | Tabellen | Anlagen | Fußnoten | Tiefe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west | verwaltungsvorschrift | 860 | 79905 | 387 | 461 | 0 | 0 | 0 | 5 |
| allgemeines-berggesetz-west | gesetz | 969 | 111019 | 232 | 255 | 0 | 0 | 178 | 5 |
| wohnraumfoerderbestimmungen-des-landes-westdeutschland-2023-wfb-west | runderlass | 796 | 118040 | 198 | 235 | 0 | 0 | 0 | 6 |
| justg-west | gesetz | 940 | 130133 | 173 | 223 | 0 | 0 | 81 | 7 |
| sbauvo-west | verordnung | 1463 | 247053 | 164 | 219 | 3 | 0 | 72 | 8 |
| schulg-west | gesetz | 1460 | 298547 | 154 | 194 | 0 | 0 | 115 | 6 |
| lbg-west | gesetz | 1146 | 213067 | 151 | 160 | 1 | 0 | 32 | 6 |
| heilberg-west | gesetz | 1146 | 185523 | 149 | 149 | 0 | 0 | 211 | 6 |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | gesetz | 868 | 197842 | 148 | 197 | 0 | 0 | 63 | 7 |
| go-west | gesetz | 1442 | 283672 | 146 | 156 | 0 | 0 | 157 | 5 |
| hg-west | gesetz | 1055 | 233185 | 146 | 158 | 0 | 0 | 105 | 4 |
| stvollzg-west | gesetz | 850 | 136236 | 137 | 158 | 0 | 0 | 66 | 5 |
| lmg-west | gesetz | 1107 | 222957 | 134 | 156 | 0 | 0 | 133 | 5 |
| lho-west | gesetz | 622 | 105887 | 133 | 133 | 0 | 0 | 30 | 4 |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33748 | foerderrichtlinie | 395 | 103502 | 127 | 137 | 0 | 0 | 0 | 5 |
| ggo-lobpolnrw-west | runderlass | 298 | 37321 | 123 | 157 | 0 | 0 | 0 | 4 |
| richtlinie-fuer-die-gewaehrung-von-finanzierungshilfen-zur-foerderung-west | foerderrichtlinie | 354 | 46233 | 123 | 135 | 0 | 0 | 0 | 5 |
| lbeamtvg-west | gesetz | 988 | 207151 | 121 | 133 | 2 | 0 | 25 | 6 |
| lpvg-west | gesetz | 990 | 145520 | 118 | 142 | 2 | 0 | 121 | 7 |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west | foerderrichtlinie | 482 | 81373 | 118 | 125 | 0 | 0 | 0 | 5 |

## Online-Prüfung (https://landesrecht-online.de, 60 Abrufe)

30 Normen geprüft, 0 mit Befunden; Abrufzeit Median 264 ms, Maximum 902 ms.

| Norm | HTTP | ms | KB | Übersicht (Soll) | fehlende Ziele | Textblöcke (Soll) | Einheiten (Soll) | Ende vorhanden | Suche | Rang | Befunde |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| avwgebo-west | 200 | 902 | 983 | 8 (8) | 0 | 5860 (5860) | 8 (8) | ja | ja (1) | 1 |  |
| sbauvo-west | 200 | 432 | 545 | 219 (219) | 0 | 1129 (1129) | 150 (150) | ja | ja (2) | 1 |  |
| schulg-west | 200 | 487 | 554 | 194 (194) | 0 | 1139 (1139) | 138 (138) | ja | ja (63) | 1 |  |
| go-west | 200 | 327 | 518 | 156 (156) | 0 | 1094 (1094) | 146 (146) | ja | ja (12) | 1 |  |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | 200 | 257 | 471 | 68 (68) | 0 | 1110 (1110) | 46 (46) | ja | ja (3) | 1 |  |
| kwahlo-west | 200 | 340 | 372 | 111 (111) | 0 | 702 (702) | 111 (111) | ja | ja (1) | 1 |  |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | 200 | 311 | 414 | 129 (129) | 0 | 1119 (1119) | 91 (91) | ja | ja (9) | 1 |  |
| hg-west-31126 | 200 | 384 | 588 | 134 (134) | 0 | 1007 (1007) | 114 (114) | ja | ja (27) | 2 |  |
| heilberg-west | 200 | 297 | 367 | 149 (149) | 0 | 784 (784) | 132 (132) | ja | ja (3) | 1 |  |
| lbg-west | 200 | 269 | 389 | 160 (160) | 0 | 856 (856) | 142 (142) | ja | ja (13) | 1 |  |
| polg-west | 200 | 260 | 316 | 108 (108) | 0 | 626 (626) | 88 (88) | ja | ja (8) | 1 |  |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | 200 | 249 | 387 | 95 (95) | 0 | 560 (560) | 85 (85) | ja | ja (5) | 1 |  |
| lmg-west | 200 | 248 | 412 | 156 (156) | 0 | 816 (816) | 130 (130) | ja | ja (4) | 1 |  |
| verordnung-ueber-den-erwerb-der-fachgebundenen-hochschulreife-waehrend-west | 200 | 211 | 39 | 9 (9) | 0 | 23 (23) | 9 (9) | ja | ja (1) | 1 |  |
| hg-west | 200 | 254 | 435 | 158 (158) | 0 | 786 (786) | 126 (126) | ja | ja (27) | 1 |  |
| lpvg-west | 200 | 265 | 309 | 142 (142) | 0 | 516 (516) | 117 (117) | ja | ja (21) | 1 |  |
| lbeamtvg-west | 200 | 264 | 367 | 133 (133) | 0 | 774 (774) | 109 (109) | ja | ja (1) | 1 |  |
| 3-rundfunkaenderungsgesetz-west | 200 | 186 | 28 | 3 (3) | 0 | 15 (15) | 3 (3) | ja | ja (2) | 1 |  |
| allgemeines-berggesetz-west | 200 | 235 | 312 | 255 (255) | 0 | 535 (535) | 229 (229) | ja | ja (2) | 1 |  |
| justg-west | 200 | 395 | 302 | 223 (223) | 0 | 629 (629) | 153 (153) | ja | ja (1) | 1 |  |
| bekanntmachung-der-neufassung-des-wassergesetzes-fuer-das-land-west | 200 | 357 | 395 | 197 (197) | 0 | 606 (606) | 127 (127) | ja | ja (2) | 1 |  |
| zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west | 200 | 425 | 224 | 461 (461) | 0 | 398 (398) | 0 (0) | ja | ja (1) | 1 |  |
| stvollzg-west | 200 | 313 | 294 | 158 (158) | 0 | 619 (619) | 114 (114) | ja | ja (3) | 1 |  |
| vwvfg-west | 200 | 291 | 290 | 145 (145) | 0 | 636 (636) | 115 (115) | ja | ja (29) | 1 |  |
| wohnraumfoerderbestimmungen-des-landes-westdeutschland-2023-wfb-west | 200 | 251 | 246 | 235 (235) | 0 | 541 (541) | 0 (0) | ja | ja (1) | 1 |  |
| bvo-west | 200 | 215 | 235 | 41 (41) | 0 | 445 (445) | 41 (41) | ja | ja (2) | 1 |  |
| lho-west | 200 | 224 | 235 | 133 (133) | 0 | 457 (457) | 133 (133) | ja | ja (57) | 1 |  |
| richtlinie-ueber-die-gewaehrung-von-billigkeitsleistungen-des-landes-west | 200 | 202 | 148 | 125 (125) | 0 | 356 (356) | 0 (0) | ja | ja (1) | 1 |  |
| ahaftvollzg-west | 200 | 232 | 215 | 59 (59) | 0 | 339 (339) | 59 (59) | ja | ja (1) | 1 |  |
| richtlinie-ueber-die-gewaehrung-von-zuwendungen-aus-dem-programm-fuer-west-33748 | 200 | 221 | 171 | 137 (137) | 0 | 258 (258) | 0 (0) | ja | ja (5) | 2 |  |
