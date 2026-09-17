# Tabellen ohne Kopfzeile, mehrfach eingebettete Fußnoten – technische Klassifikation

Erzeugt mit `npm run audit:legacy-structure` -- --online. Offline über alle 1493 West-Normen; Format je Norm aus dem
Manifest (`contentFormat`: native = RECHT.NRW-HTML, legacy-file = Word-Altdatei). Keine Normstrukturänderung – die Einordnung
beschreibt, was ein Parser aus der Quelle ableiten könnte, und was die Website daraus macht.

## Tabellen (390 in 156 Normen)

| Kennzahl | Wert |
| --- | --- |
| Tabellen mit Kopfzellen (`tableHeaderCell`) | 0 (0 Kopfzellen) |
| nach Format | legacy-file 99, native 291 |
| nach Klasse | datenzeile-zuerst 191, einspaltig-oder-layout 61, einzeilig 56, kopfzeilen-kandidat 79, nummernspalte 3 |

Klassen: `kopfzeilen-kandidat` = erste Zeile besteht aus kurzen Bezeichnern ohne Satzende (ein Parser könnte sie als
Kopfzeile markieren – erst nach Prüfung je Quelle, da RECHT.NRW keine `<th>` liefert); `datenzeile-zuerst` = erste Zeile ist
Inhalt (keine Kopfzeile in der Quelle, `<th>` wäre falsch); `einspaltig-oder-layout` = Layout-/Aufzählungstabelle;
`einzeilig` = nur eine Zeile; `nummernspalte` = erste Zeile nummeriert.

Darstellung/A11y: Die Website rendert `<th scope>` sobald Kopfzellen im Blockmodell vorkommen (NormBody.astro), jede Tabelle
liegt in einer benannten, fokussierbaren Scroll-Region (`role="region"`, `tabindex="0"`) mit optionaler `<caption>`. Tabellen ohne
`<th>` sind ein Hinweis (Screenreader lesen Zellen ohne Kopfbezug), kein Fehler; die Ursache liegt in der Quelle/im Parser, nicht
in der Darstellung. Keine Änderung in `apps/web`.

### Kopfzeilen-Kandidaten (79, erste 40)

| Norm | Format | Nr. | Zeilen | Spalten | erste Zeile |
| --- | --- | --- | --- | --- | --- |
| 3-rundfunkaenderungsgesetz-west | native | 3 | 2 | 3 | Satellit \| Position \| Übertragungsverfahren |
| 3-rundfunkaenderungsgesetz-west | native | 5 | 2 | 3 | Satellit \| Position \| Frequenzbereich |
| 3-rundfunkaenderungsgesetz-west | native | 7 | 2 | 3 | Satellit \| Position \| Übertragungsverfahren |
| aojw-west | native | 1 | 7 | 2 | sehr gut \| eine besonders hervorragende Leistung, |
| apo-desinf-west | native | 2 | 4 | 2 | ,,sehr gut“ \| bei einem Zahlenwert von 1 oder 1,5 |
| apo-gost-west | legacy-file | 1 | 8 | 3 | Note \| Punkte nach Notentendenz \| Notendefinition |
| apo-os-west | native | 1 | 47 | 2 | § 1 \| Auftrag |
| apo-sma-west | native | 3 | 5 | 2 | ,,sehr gut“ \| bei Werten unter 1,5, |
| apo-wbk-west | legacy-file | 2 | 8 | 3 | Note \| Punkte nach Notentendenz \| Notendefinition |
| apovd1-2-west | native | 2 | 8 | 2 | Ausbildungsabschnitt \| Dauer |
| ausbildungs-und-pruefungsordnung-berg-und-markscheidefach-west | native | 3 | 6 | 3 | 13,50 bis 15,00 Punkte \| = \| sehr gut, |
| boa-west | native | 14 | 12 | 5 | Bei einer maßgebenden \| Bei einer Geschwindigkeit bis |
| bundesmehrarbeitsverguetungsverordnung-west | native | 1 | 4 | 2 | A 2 bis A 4 \| 9,96 Euro, |
| dwvo-west | native | 1 | 13 | 2 | Monat \| Prozentsatz |
| eeg-west | native | 1 | 3 | 2 | § 1 \| Anwendungsbereich |
| eeg-west | native | 3 | 10 | 2 | § 8 \| Entschädigungsgrundsätze |
| eeg-west | native | 4 | 19 | 2 | § 18 \| Enteignungsbehörde, förmliches Verfahren |
| eeg-west | native | 6 | 2 | 2 | § 40 \| Übernahmeverfahren |
| eeg-west | native | 7 | 2 | 2 | § 42 \| Voraussetzung und Verfahren |
| eeg-west | native | 8 | 2 | 2 | § 44 \| Kosten |
| eeg-west | native | 11 | 3 | 2 | § 51 \| Anpassung von Gesetzen |
| entschvo-west | native | 2 | 10 | 3 | in Gemeinden \| monatliche Pauschale \| Sitzungsgeld |
| entschvo-west | native | 4 | 3 | 3 | in Kreisen \| monatliche Pauschale \| Sitzungsgeld |
| entschvo-west | native | 6 | 4 | 3 | in Stadtbezirken \| monatliche Pauschale \| Sitzungsgeld |
| entschvo-west | native | 12 | 6 | 2 | 1. bis 500 Einwohnerinnen und Einwohnern \| 155,00 Euro |
| erschwerniszulagenverordnung-west | legacy-file | 1 | 4 | 2 | bis zu 5 Metern \| 14,30 Euro, |
| erschwerniszulagenverordnung-west | legacy-file | 2 | 5 | 2 | von mehr als 20 Metern \| 2,10 Euro, |
| erschwerniszulagenverordnung-west | legacy-file | 3 | 4 | 2 | von mehr als 50 Metern \| um 0,70 Euro, |
| erschwerniszulagenverordnung-west | legacy-file | 11 | 2 | 3 | a) \| des Absatzes 1 Nr. 1 \| 153,39 Euro monatlich, |
| erstes-gesetz-zur-funktionalreform-1-frg-west | native | 1 | 33 | 2 | Artikel 1 \| Änderung der Gemeindeordnung |
| feschvo-west | legacy-file | 2 | 7 | 2 | 300 \| Bauwerk-Baukonstruktionen |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | native | 2 | 22 | 4 | 1 \| Barntrup \| 127,33 \| 138 800 RM |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | native | 4 | 63 | 4 | 1 \| Gemeinde \| Spork \| 58,8274 ha |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | native | 7 | 8 | 3 | Hiddessen \| 2495,2212 ha \| 187 000 RM |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | native | 10 | 56 | 3 | Detmold, \| Grabenstr. 1 \| 19 700 RM |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | native | 13 | 9 | 3 | Landestheater \| 0,3798 ha \| 857 800 RM |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | native | 17 | 7 | 4 | Hermannsdenkmalstiftung \| 12,3606 \| 124 800 \| 452 300 |
| gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-der-west | native | 4 | 2 | 2 | gez. Dr. Ako Haarbeck \| gez. Christian Harms |
| gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-der-west | native | 8 | 2 | 2 | gez. Dr. Ako Haarbeck \| gez. Christian Harms |
| kro-west | legacy-file | 2 | 4 | 2 | bis 200 000 Einwohner \| von 5 % |

## Mehrfach eingebettete Fußnoten (150 Normen)

| Kennzahl | Wert |
| --- | --- |
| Normen mit mehrfach eingebetteten Fußnoten | 150 (legacy-file 149, native 1) |
| doppelte Definitionen (gleiches Zeichen, gleicher Text) | 650 |

Einordnung: Der Legacy-Parser bettet die Fußnotendefinition an jeder Verweisstelle erneut ein (Quelle: Word-HTML ohne stabile
Fußnotenanker). Fachlich ist der Text vollständig und an jeder Stelle lesbar; die Quellzählung steht in den Quellhinweisen. Die
Website rendert jede eingebettete Fußnote als `<p class="norm-footnote">` ohne `id` – keine doppelten ids, kein A11y-Fehler,
Redundanz ist reine Textwiederholung. Eine Deduplizierung wäre eine Parser-/Strukturänderung (Fußnotenblock je Zeichen mit
Verweisen) und keine Darstellungskorrektur.

| Norm | Format | Fußnoten | davon eindeutig | mehrfach | max. Wiederholung | Beispiel |
| --- | --- | --- | --- | --- | --- | --- |
| heilberg-west | legacy-file | 211 | 30 | 14 | 114 | Fn 25 ×114: Überschrift jeweils neu gefasst in §§ 1 bis 18, 20 bis 53, V. Abschnitt, § 58 un |
| uvollzg-west | legacy-file | 82 | 22 | 3 | 55 | Fn 2 ×55: § 4, 5, 6, 8, Abschnitt 3, § 15, Abschnitt 5, Überschrift von Abschnitt 6, Absch |
| lmg-west | legacy-file | 133 | 30 | 19 | 36 | Fn 28 ×36: §§ 1, 2, 3, 4, 7, 8, 9, 10, 14, 17, 18, 19, 20, 21, 23, 24, 25 (Absatz 1 und 2 n |
| kwahlo-west | legacy-file | 117 | 31 | 14 | 34 | Fn 5 ×34: §§ 2, 4, 7, 11, 12, 14, 16, 17, 19, 20, 23, 24, 27, 30, 31, 35, 40, 50, 53, 56,  |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-der-west | legacy-file | 34 | 4 | 2 | 29 | Fn 3 ×29: Überschrift und §§ 2, 3, 5, 6, 13, 20, 27, 29, 30 und 31 geändert und §§ 1, 7, 8 |
| hg-west-31126 | legacy-file | 90 | 49 | 6 | 28 | Fn 10 ×28: § 36 Absatz 1 zuletzt geändert, § 4 Absatz 4, § 5 Absatz 2, 5, 6, 7, 8 und 9, §  |
| ahaftvollzg-west | legacy-file | 61 | 9 | 4 | 26 | Fn 4 ×26: § 2 Absatz 3 neu gefasst und Absatz 4 angefügt, § 4 (alt) wird § 5 und Absatz 2  |
| gesetz-ueber-die-kunsthochschulen-des-landes-westdeutschland | legacy-file | 85 | 13 | 8 | 26 | Fn 14 ×26: §§ 1, 2, 3, 4, 7, 9, 10, 11, 12, 16, 18, 19, 20, 24, 26, 28, 29, 31, 32, 34, 35, |
| hdvo-west | legacy-file | 34 | 9 | 1 | 26 | Fn 8 ×26: Teil 2 bis 6 mit den §§ 11 bis 31 eingefügt durch Artikel 1 der Verordnung vom 8 |
| schulg-west | legacy-file | 115 | 36 | 15 | 25 | Fn 37 ×25: Inhaltsübersicht, §§ 2, 3, 6, 10, 12, 14 15, 16, 18, 20, 22, 23, 25, 42, 51, 53, |
| gesetz-ueber-den-ruhrverband-ruhrverbandsgesetz-ruhrvg-west | legacy-file | 39 | 12 | 5 | 24 | Fn 2 ×24: Inhaltsübersicht, § 1, § 3, § 6, Überschrift des Sechsten Teils, § 28 und Übersc |
| go-west | legacy-file | 157 | 62 | 22 | 23 | Fn 27 ×23: Der 8. Teil Haushaltswirtschaft wird neu gefasst und die §§ 75-94 (alt) werden n |
| jag-west | legacy-file | 60 | 27 | 6 | 23 | Fn 10 ×23: § 1, § 2 Absatz 2 und 3, § 3 Absatz 3, § 7 Absatz 1, 2 und 3, § 8 Absatz 2 und 3 |
| bauordnung-fuer-das-land-westdeutschland-landesbauordnung-2018-bauo-west | legacy-file | 47 | 27 | 2 | 20 | Fn 5 ×20: § 2 Absatz 3, § 11 Absatz 3, § 26 Absatz 3, § 30 Absatz 5, § 34 Absatz 5, § 35 A |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-30018 | legacy-file | 40 | 10 | 5 | 19 | Fn 4 ×19: §§ 1, 2, 3, 8 bis 12, 14, 16, 17, 19, 20, 22, 24 bis 27 zuletzt geändert durch V |
| apg-dvo-west | legacy-file | 34 | 7 | 4 | 15 | Fn 7 ×15: § 1 Absatz 1, 3, 4 und 5, § Absatz 1, 2, 3 (neu gefasst) und 7, § 3 Absatz 1, 2  |
| jmstv-west | native | 33 | 7 | 2 | 15 | Fn 2 ×15: § 4, § 5, § 8, § 9, § 10, § 15, § 16, § 17 und § 19 geändert, § 18 und § 26 zule |
| ljg-west | legacy-file | 47 | 20 | 9 | 15 | Fn 18 ×15: § 2 neu gefasst sowie § 7, § 9, § 17 a, § 19, § 20, § 25, § 30, § 31, § 34, § 52 |
| ag-tiergesg-tiernebg-west | legacy-file | 23 | 5 | 3 | 14 | Fn 2 ×14: Zwischenüberschrift vor § 1, § 1, § 2, § 3, § 6, § 7, § 15, § 17, § 18, § 22, §  |
| gkg-west | legacy-file | 36 | 14 | 5 | 14 | Fn 3 ×14: § 1, § 2, § 4, § 8, § 9, § 10, § 13, § 15, § 16, § 18, § 19, § 20, § 24 und § 31 |
| justg-west | legacy-file | 81 | 34 | 16 | 14 | Fn 25 ×14: § 2 Absatz 1, § 4 Absatz 2, § 5 Absatz 2 und 3, § 7 Absatz 1, § 24 Absatz 2, § 2 |
| landesplanungsgesetz-westdeutschland | legacy-file | 67 | 19 | 9 | 14 | Fn 15 ×14: Die folgenden §§ wurden umbenannt und geändert durch Artikel 1 des Gesetzes vom  |
| gesetz-ueber-den-landesverband-lippe-west | legacy-file | 28 | 10 | 5 | 13 | Fn 6 ×13: § 7 neu gefasst und § 8 neu eingefügt sowie §§ 8 - 18 (alt) umbenannt in §§ 9 -  |
| kommunalwahlgesetz-west | legacy-file | 50 | 18 | 8 | 13 | Fn 2 ×13: § 1, § 18, § 19 und § 35 geändert, § 4, § 10, § 13, § 14, § 23, § 45, § 50 und § |
| baupruefvo-west | legacy-file | 38 | 10 | 6 | 12 | Fn 4 ×12: § 1, § 2, § 4, § 5, § 6, § 7, § 8, § 13, § 14, § 16, § 19 und § 20 zuletzt geänd |
| verordnung-ueber-die-ausbildung-und-pruefung-fuer-die-aemtergruppe-des-west-30286 | legacy-file | 33 | 14 | 3 | 12 | Fn 9 ×12: §§ 1, 8, 9, 12, 13, 14, 16, 17, 19, 22, 27 und 29 zuletzt geändert durch Verordn |
| wbvo-pflege-west | legacy-file | 25 | 12 | 2 | 12 | Fn 9 ×12: § 4, § 8 Absatz 4 und 5, § 9 Absatz 1 und 2, § 10 Absatz 2, § 22, § 23, § 24, §  |
| obg-west | legacy-file | 39 | 23 | 5 | 11 | Fn 22 ×11: §§ 10, 15, 18, 21, 22, 23, 27, 33, 34, 39, 40, 46 und 47 geändert durch Artikel  |
| strwg-west | legacy-file | 50 | 21 | 9 | 11 | Fn 5 ×11: § 13, § 20, Überschrift Teil 2 und § 55 geändert sowie § 8, § 25, § 28, § 37b, § |
| ukvo-west | legacy-file | 24 | 9 | 3 | 11 | Fn 3 ×11: § 10 neu eingefügt und §§ 10 bis 19 (alt) umbenannt in §§ 11 bis 20 (neu) durch  |
| verordnung-zur-errichtung-integrierter-untersuchungsanstalten-fuer-west | legacy-file | 61 | 10 | 7 | 11 | Fn 10 ×11: § 2, § 7, § 11, § 13, § 16, § 18, § 20, § 21 Absatz 1 und 2, § 23, § 25 und § 28 |
| erschwerniszulagenverordnung-west | legacy-file | 17 | 6 | 3 | 10 | Fn 2 ×10: §§ 4a, 5, 8, 11, 13, 19, 22 und 22a geändert durch Artikel 14 des Gesetzes vom 7 |
| eu-west-28724 | legacy-file | 38 | 24 | 2 | 10 | Fn 6 ×10: § 2 (alt) umbenannt in § 3 und geändert, § 3 (alt) umbenannt in § 4, § 4 (alt) u |
| gesetz-ueber-den-westdeutschen-rundfunk-koeln-wdr-gesetz-bekanntmachung-west | legacy-file | 67 | 25 | 13 | 10 | Fn 16 ×10: § 7 neu gefasst, §§ 13a, 14a und 57b neu eingefügt sowie §§ 22, 34, 38, 39, 45a  |
| khgg-west | legacy-file | 36 | 17 | 6 | 10 | Fn 11 ×10: §§ 1, 7, 9, 12, 13, 16, 17, 31, 36 und 38 zuletzt geändert durch Gesetz vom 9. M |
| stbvg-nw-west | legacy-file | 16 | 6 | 2 | 10 | Fn 4 ×10: § 2, § 3, § 4, § 6, § 7, § 9, § 10 und § 13 zuletzt geändert und § 5 geändert du |
| apg-west | legacy-file | 20 | 6 | 3 | 9 | Fn 3 ×9: §§ 2, 7, 9, 10, 11, 12, 13, 14 und 21 geändert durch Artikel 10 des Gesetzes vom |
| apo-wbk-west | legacy-file | 55 | 25 | 10 | 9 | Fn 26 ×9: §§ 1, 11, 22, 25, 26, 28, 30, 34 und 36 zuletzt geändert durch Artikel 5 der Ver |
| gesetz-ueber-den-verfassungsgerichtshof-fuer-das-land-westdeutschland | legacy-file | 46 | 29 | 7 | 9 | Fn 21 ×9: §§ 53 bis 61 eingefügt durch Artikel 1 des Gesetzes vom 21. Juli 2018 (GV. NRW.  |
| jvollzdsg-west | legacy-file | 13 | 5 | 1 | 9 | Fn 3 ×9: § 2, § 12; § 13 Absatz 2, § 15 Absatz 2, § 20 Absatz 3, § 24 Absatz 7, § 33 Absa |

## Stichprobe online (5)

Basis `https://landesrecht.xyungeloestlp.workers.dev`: Vorbefund-Seiten aus `accessibility.md` (doppelte ids) sowie Normen mit den meisten Tabellen bzw. eingebetteten Fußnoten.

| Norm | Grund | HTTP | ms | doppelte ids | Tabellen | ohne th | in Scroll-Region | Fußnoten (Soll) | Befunde |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lostv-west | accessibility.md: doppelte ids (Vorbefund) | 200 | 341 | 0 | 32 | 0 | 32 | 1 (1) |  |
| gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west | accessibility.md: doppelte ids (Vorbefund) | 200 | 462 | 0 | 1 | 1 | 1 | 46 (46) |  |
| gesetz-ueber-die-vereinigung-des-landes-lippe-mit-dem-land-west | meiste Tabellen | 200 | 140 | 0 | 18 | 11 | 18 | 1 (1) |  |
| heilberg-west | meiste eingebettete Fußnoten | 200 | 388 | 0 | 0 | 0 | 0 | 211 (211) |  |
| go-west | meiste eingebettete Fußnoten | 200 | 220 | 0 | 0 | 0 | 0 | 157 (157) |  |
