# NSH-Ausgangsrechtsstand – Freigabeübersicht für den Baseline-Freeze

Automatisch erzeugt von `node scripts/nsh-freeze-readiness.ts --write`. Freeze-Readiness: **READY WITH HUMAN REVIEW**. Der Freeze ist **nicht gesetzt**; er wird mit einer einzigen Entscheidung freigegeben (unten).

## Freizugebender Bestand

| Kennzahl | Wert |
| --- | --- |
| Baseline-Normen | 2.672 |
| Stichtagsfassung exakt aus der heutigen Ausgabe | 2.329 |
| Stichtagsfassung aus juris-Einzelfassungen zusammengesetzt | 343 |
| Normen mit Tabellen / Tabellen | 306 / 767 |
| davon durch die Simulation fortgeschrieben (Seeds) | 6 |

**Fingerabdruck des Baselinebestands:** `1b92d06468585d5d6bbb241b470638939520d96b1b7a7e0fffea514950548cf9` – SHA-256 über die sortierte Liste „Pfad SHA-256“ aller `content/norms/nsh/<slug>/versions/2023-12-01.json` des juris-Bestands (2.672 Dateien).

## Offene fachliche Entscheidungen

| Dokument | Titel | Gruppe | Befund |
| --- | --- | --- | --- |
| `VVSH-VVSH000002248` | Einführung der DIN 1999 – 100 "Abscheideranlagen für Leichtflüssigkeit | Landesbezeichnung oder Kürzel ohne Regel | versions[0].body[1].children[0].text: „Schl.-H.“ blieb unverändert stehen (Kontext: „IN EN 858 – 2" die Worte "(DIN 1999-100 Schl.-H.)" eingefügt.“) / versions[0].body[8].children[1].text: „Schl.-H.“ blieb unverändert st |

Diese Dokumente sind nicht veröffentlicht; sie sperren den Freeze nicht, bleiben aber offen, bis entschieden ist.

## Bewusst ausgeschlossen (nicht veröffentlicht, auditierbar, bei neuer Evidenz wieder offen)

| ReasonCode | Fälle | Dokumente | Entscheidung |
| --- | ---: | ---: | --- |
| `unsafe-table-structure` | 182 | 179 | Auftrag Lauf 17, Punkt 3 A; docs/NSH_BASELINE_HUMAN_APPROVAL.md |
| `missing-normative-annex` | 79 | 79 | Auftrag Lauf 17, Punkt 3 B |
| `missing-normative-text` | 18 | 17 | Auftrag Lauf 17, Punkte 3 B und 9 |
| `annex-parent-unresolved` | 12 | 12 | Auftrag Lauf 17, Punkt 3 C |
| `baseline-validity-unresolved` | 19 | 19 | Auftrag Lauf 17, Punkt 8 |
| `source-deficiency` | 16 | 16 | Auftrag Lauf 17, Punkt 9 |
| `not-at-baseline` | 2 | 2 | Auftrag Lauf 17, Punkte 6 und 7 |
| `baseline-seed-authoritative` | 1 | 1 | Nutzer (Auftrag Lauf 17, Punkt 10) |

**Tabellen-Exclusions** (179 Dokumente, Tabellenstruktur nicht eindeutig; kein Fallback „Text ohne Tabelle“): `VVSH-VVSH000000152`, `VVSH-VVSH000000159`, `VVSH-VVSH000000211`, `VVSH-VVSH000001026`, `VVSH-VVSH000001367`, `VVSH-VVSH000001721`, `VVSH-VVSH000001845`, `VVSH-VVSH000001883`, `VVSH-VVSH000002077`, `VVSH-VVSH000003663`, `VVSH-VVSH000003664`, `VVSH-VVSH000003901`, `VVSH-VVSH000003902`, `VVSH-VVSH000003903`, `VVSH-VVSH000003988`, `VVSH-VVSH000004115`, `VVSH-VVSH000004227`, `VVSH-VVSH000004274`, `VVSH-VVSH000004402`, `VVSH-VVSH000004617`, `VVSH-VVSH000004811`, `VVSH-VVSH000004823`, `VVSH-VVSH000005076`, `VVSH-VVSH000005184`, `VVSH-VVSH000005490`, `VVSH-VVSH000005508`, `VVSH-VVSH000005515`, `VVSH-VVSH000005650`, `VVSH-VVSH000005690`, `VVSH-VVSH000005711`, `VVSH-VVSH000005849`, `VVSH-VVSH000005898`, `VVSH-VVSH000005915`, `VVSH-VVSH000006047`, `VVSH-VVSH000006075`, `VVSH-VVSH000006094`, `VVSH-VVSH000006108`, `VVSH-VVSH000006129`, `VVSH-VVSH000006145`, `VVSH-VVSH000006167`, `VVSH-VVSH000006235`, `VVSH-VVSH000006348`, `VVSH-VVSH000006362`, `VVSH-VVSH000006417`, `VVSH-VVSH000006467`, `VVSH-VVSH000006468`, `VVSH-VVSH000006508`, `VVSH-VVSH000006517`, `VVSH-VVSH000006566`, `VVSH-VVSH000006609`, `VVSH-VVSH000006631`, `VVSH-VVSH000006664`, `VVSH-VVSH000006679`, `VVSH-VVSH000006707`, `VVSH-VVSH000006857`, `VVSH-VVSH000006889`, `VVSH-VVSH000007028`, `VVSH-VVSH000007061`, `VVSH-VVSH000007129`, `VVSH-VVSH000007158`, `VVSH-VVSH000007223`, `VVSH-VVSH000007252`, `VVSH-VVSH000007272`, `VVSH-VVSH000007296`, `VVSH-VVSH000007326`, `VVSH-VVSH000007370`, `VVSH-VVSH000007377`, `VVSH-VVSH000007494`, `VVSH-VVSH000007511`, `VVSH-VVSH000007767`, `VVSH-VVSH000007921`, `VVSH-VVSH000008012`, `VVSH-VVSH000008110`, `VVSH-VVSH000008171`, `VVSH-VVSH000008218`, `VVSH-VVSH000008267`, `VVSH-VVSH000008289`, `VVSH-VVSH000008379`, `VVSH-VVSH000008383`, `VVSH-VVSH000008471`, `VVSH-VVSH000008524`, `VVSH-VVSH000008530`, `VVSH-VVSH000008570`, `VVSH-VVSH000008590`, `VVSH-VVSH000008604`, `VVSH-VVSH000008605`, `VVSH-VVSH000008617`, `VVSH-VVSH000008717`, `VVSH-VVSH000008789`, `VVSH-VVSH000008913`, `VVSH-VVSH000008924`, `VVSH-VVSH000009061`, `VVSH-VVSH000009068`, `VVSH-VVSH000009134`, `VVSH-VVSH000009135`, `VVSH-VVSH000009136`, `VVSH-VVSH000009190`, `VVSH-VVSH000009262`, `VVSH-VVSH000009267`, `jlr-NNLSH00002A8B`, `jlr-NNLSH00002A8C`, `jlr-NNLSH00002A90`, `jlr-NNLSH00002A9B`, `jlr-NNLSH00002AA7`, `jlr-NNLSH00002AB0`, `jlr-NNLSH00002AB5`, `jlr-NNLSH00002AB9`, `jlr-NNLSH00002ABA`, `jlr-NNLSH00002B0A`, `jlr-NNLSH00002B25`, `jlr-NNLSH00002B46`, `jlr-NNLSH00002B5A`, `jlr-NNLSH00002B68`, `jlr-NNLSH00002B9B`, `jlr-NNLSH00002BA3`, `jlr-NNLSH00002BA7`, `jlr-NNLSH00002BAE`, `jlr-NNLSH00002BCD`, `jlr-NNLSH00002BD4`, `jlr-NNLSH00002C37`, `jlr-NNLSH00002CC1`, `jlr-NNLSH00002CF3`, `jlr-NNLSH00002D35`, `jlr-NNLSH00002D36`, `jlr-NNLSH00002D3F`, `jlr-NNLSH00002D43`, `jlr-NNLSH00002D57`, `jlr-NNLSH00002D5A`, `jlr-NNLSH00002D69`, `jlr-NNLSH00002D6D`, `jlr-NNLSH00002DB0`, `jlr-NNLSH00002DB5`, `jlr-NNLSH00002DE0`, `jlr-NNLSH00002DEE`, `jlr-NNLSH00002E60`, `jlr-NNLSH00002E7E`, `jlr-NNLSH00002EA5`, `jlr-NNLSH00002F0F`, `jlr-NNLSH00002F48`, `jlr-NNLSH00002F59`, `jlr-NNLSH00002F5C`, `jlr-NNLSH00002F7C`, `jlr-NNLSH00002F9F`, `jlr-NNLSH00002FEB`, `jlr-NNLSH00003019`, `jlr-NNLSH00003027`, `jlr-NNLSH0000302B`, `jlr-NNLSH0000302C`, `jlr-NNLSH0000302D`, `jlr-NNLSH0000302E`, `jlr-NNLSH00003090`, `jlr-NNLSH000030F5`, `jlr-NNLSH0000314B`, `jlr-NNLSH00003185`, `jlr-NNLSH00003186`, `jlr-NNLSH00003188`, `jlr-NNLSH00003189`, `jlr-NNLSH0000318A`, `jlr-NNLSH000031A7`, `jlr-NNLSH0000326B`, `jlr-NNLSH00003278`, `jlr-NNLSH0000327A`, `jlr-NNLSH0000327C`, `jlr-NNLSH0000327D`, `jlr-NNLSH0000327E`, `jlr-NNLSH00003283`, `jlr-NNLSH000032B5`, `jlr-NNLSH000032BF`, `jlr-NNLSH000032C3`, `jlr-NNLSH000032C8`, `jlr-NNLSH000032E2`, `jlr-NNLSH00003464`, `jlr-NNLSH00003476`, `jlr-NNLSH0000348D`, `jlr-NNLSH000034C7`, `jlr-NNLSH000034FB`, `jlr-NNLSH000035D7`, `jlr-NNLSH000036FD`, `jlr-NNLSH00003731`

**Anlagen-Exclusions** (91 Dokumente, normative Anlage fehlt bzw. Stammnorm nicht belegt; keine OCR): `VVSH-VVSH000003938`, `VVSH-VVSH000003939`, `VVSH-VVSH000003940`, `VVSH-VVSH000009113`, `VVSH-VVSH000009120`, `VVSH-VVSH000009121`, `VVSH-VVSH000009122`, `VVSH-VVSH000009123`, `VVSH-VVSH000009124`, `VVSH-VVSH000009125`, `VVSH-VVSH000009337`, `VVSH-VVSH000009377`, `jlr-NNLSH00002A7D`, `jlr-NNLSH00002A8A`, `jlr-NNLSH00002A8B`, `jlr-NNLSH00002A8C`, `jlr-NNLSH00002B46`, `jlr-NNLSH00002BCC`, `jlr-NNLSH00002C7D`, `jlr-NNLSH00002CF8`, `jlr-NNLSH00002CFE`, `jlr-NNLSH00002D00`, `jlr-NNLSH00002D01`, `jlr-NNLSH00002D30`, `jlr-NNLSH00002D57`, `jlr-NNLSH00002D7F`, `jlr-NNLSH00002DDD`, `jlr-NNLSH00002DFE`, `jlr-NNLSH00002E02`, `jlr-NNLSH00002E13`, `jlr-NNLSH00002E14`, `jlr-NNLSH00002E15`, `jlr-NNLSH00002E16`, `jlr-NNLSH00002E18`, `jlr-NNLSH00002E19`, `jlr-NNLSH00002E1A`, `jlr-NNLSH00002E1B`, `jlr-NNLSH00002E1C`, `jlr-NNLSH00002E1D`, `jlr-NNLSH00002E1E`, `jlr-NNLSH00002E20`, `jlr-NNLSH00002E22`, `jlr-NNLSH00002E23`, `jlr-NNLSH00002E24`, `jlr-NNLSH00002E28`, `jlr-NNLSH00002E29`, `jlr-NNLSH00002E2C`, `jlr-NNLSH00002E2D`, `jlr-NNLSH00002E2E`, `jlr-NNLSH00002E2F`, `jlr-NNLSH00002E30`, `jlr-NNLSH00002E32`, `jlr-NNLSH00002E33`, `jlr-NNLSH00002E34`, `jlr-NNLSH00002E36`, `jlr-NNLSH00002E37`, `jlr-NNLSH00002E39`, `jlr-NNLSH00002E3A`, `jlr-NNLSH00002E3B`, `jlr-NNLSH00002E3C`, `jlr-NNLSH00002E3D`, `jlr-NNLSH00002E40`, `jlr-NNLSH00002E42`, `jlr-NNLSH00002E64`, `jlr-NNLSH00002E65`, `jlr-NNLSH00002E66`, `jlr-NNLSH00002E8A`, `jlr-NNLSH00002FEF`, `jlr-NNLSH00003110`, `jlr-NNLSH00003143`, `jlr-NNLSH0000315D`, `jlr-NNLSH00003272`, `jlr-NNLSH00003296`, `jlr-NNLSH00003297`, `jlr-NNLSH00003298`, `jlr-NNLSH00003299`, `jlr-NNLSH0000329A`, `jlr-NNLSH0000329B`, `jlr-NNLSH0000329C`, `jlr-NNLSH0000329D`, `jlr-NNLSH000032A8`, `jlr-NNLSH000032C3`, `jlr-NNLSH000032DA`, `jlr-NNLSH00003497`, `jlr-NNLSH0000352B`, `jlr-NNLSH00003542`, `jlr-NNLSH0000355E`, `jlr-NNLSH0000356B`, `jlr-NNLSH0000357B`, `jlr-NNLSH00003582`, `jlr-NNLSH0000359B`

## Ungelöste Quellenlücken

125 Fälle in 124 Dokumenten mit fehlender Quelle (`missing-normative-annex`, `missing-normative-text`, `source-deficiency`, `annex-parent-unresolved`) und 19 Geltungsfälle ohne belegbare Stichtagsfassung. Sie bleiben ausgeschlossen, bis neue Evidenz (amtliche Veröffentlichung, zugängliche Anlage) vorliegt.

### Geltungs- und Historienfälle (einzeln geprüft)

Übernommen durch belegte Regeln: `jlr-NNLSH00002AD5` (Rundfunkfinanzierungsstaatsvertrag § 9: jüngere offene Fassung löst die ältere mit nicht nachgeführtem Ende ab), `jlr-NNLSH00002BD8` (Landwirtschaftskammergesetz: nahtlos fortgeführter Ressort-Zwilling maßgeblich), `jlr-NNLSH00002AC2` (Geschäftsordnung des Landtages) und `jlr-NNLSH00002AE9` (StrWG): eingefügte Paragraphen innerhalb eines §-Laufs eingeordnet.

| Dokument | Titel | Beleglage | Entscheidung |
| --- | --- | --- | --- |
| `jlr-NNLSH00002A85` | Gesetz des Landes Schleswig-Holstein über die Besoldung der Beamtinnen | § 45a: Fassung vom 24.03.2022 gültig bis 31.12.2022, Folgefassung erst vom 19.07.2024 rückwirkend ab 01.01.2023 – ob das Ende 2022 ursprünglich (befristet) war, belegt juris nicht. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002B50` | Gesetz über die Landesplanung (Landesplanungsgesetz - LaplaG) in der F | § 5a: einzige Fassung vom 24.05.2024, gültig ab 04.09.2020 – Rückwirkung oder Neubekanntmachung aus juris nicht unterscheidbar. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002D16` | Landesverordnung über die Übertragung von Bauaufgaben auf das Universi | Eingangsformel: einzige Fassung vom 07.05.2024, gültig ab 16.04.2014 – Stichtagswortlaut nicht amtlich belegt. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002D19` | Landesverordnung über die Selbstüberwachung von Abwasseranlagen und Ab | Eingangsformel: einzige Fassung vom 13.05.2024, gültig ab 23.02.2012 – Stichtagswortlaut nicht amtlich belegt. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002D1E` | Landesverordnung über die Festsetzung der pauschalen Förderung nach §  | Eingangsformel: einzige Fassung vom 21.03.2024, gültig ab 01.01.2022 – Stichtagswortlaut nicht amtlich belegt. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002D2F` | Geschäftsordnung des Schleswig-Holsteinischen Landesverfassungsgericht | Erster Abschnitt: einzige Fassung vom 26.03.2024, gültig ab 13.08.2021 – Stichtagswortlaut nicht amtlich belegt. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002D45` | Gesetz über die Gewährung jährlicher Sonderzahlungen | § 7a „Einmaliger Zusatzbetrag für Kinder im Jahr 2023“: Fassung vom 19.07.2024, gültig ab 01.01.2023 – offenbar nach dem Stichtag eingefügt; die Stichtagsfassung ohne § 7a ist nicht amtlich belegt. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002CBA` | Erste Durchführungsverordnung zum Gesetz über die berufsmäßige Ausübun | § 10: zwei offene Ressort-Zwillinge vom 27.10.2023 (ab 17.11.2023) ohne Folgefassung – welcher maßgeblich ist, belegt juris nicht. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002D5C` | Landesverordnung über die Laufbahn, Ausbildung und Prüfung der Laufbah | § 51: Zwillinge vom 27.10.2023 (ab 17.11.2023), einer bis 04.04.2024 ohne anschließende Folgefassung, einer offen – nicht entscheidbar. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002AB7` | Ausführungsgesetz zum Tierkörperbeseitigungsgesetz (AG TierKBG) | GVOBl-Systematik: Ende 16.11.2004; juris führt die Norm ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002C62` | Gesetz zu dem Staatsvertrag über den Rundfunk (RStV) im vereinten Deut | GVOBl-Systematik: Aufhebung 01.01.2013; juris ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002EE1` | Landesverordnung über die Qualifikation für ein Studium an einer Hochs | GVOBl-Systematik: Ende 30.12.2018; juris ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `jlr-NNLSH00003220` | Gesetz zur Zustimmung zum Staatsvertrag über die gemeinsame Einrichtun | GVOBl-Systematik: Ende 27.10.2019; juris ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `jlr-NNLSH00003378` | Gesetz über die Errichtung der "Stiftung Schleswig-Holsteinische Lande | GVOBl-Systematik: Ende 16.12.2021; juris ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `jlr-NNLSH000033F7` | Landesverordnung zur Bestimmung der zuständigen Behörden nach dem Städ | GVOBl-Systematik: Ende 21.08.1987; juris ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `VVSH-VVSH000000584` | Verwaltungsvorschriften zur Landeshaushaltsordnung (VV-LHO) hier: Zu d | Erlassverzeichnis: Aufhebung 16.05.2007; juris ohne Ende – Widerspruch nicht aufgelöst. | `baseline-validity-unresolved` |
| `jlr-NNLSH00002E40` | Landesverordnung zur einstweiligen Sicherstellung des geplanten Naturs | juris-Titelfußnote „Fristablauf 31.12.2004“, Kopf ohne „Gültig bis“ – spricht gegen Geltung am Stichtag, amtlicher Beleg fehlt. | `baseline-validity-unresolved` |
| `VVSH-VVSH000002029` | Bundeseinheitliche Verwaltungsvorschriften zum Jugendstrafvollzug (VVJ | Verwaltungsvorschrift ohne „Fassung vom“ – Stichtagsgeltung aus der Ausgabe nicht bestimmbar. | `baseline-validity-unresolved` |
| `VVSH-VVSH000002031` | Bundeseinheitliche Verwaltungsvorschriften zum Strafvollzugsgesetz (VV | Verwaltungsvorschrift ohne „Fassung vom“ – Stichtagsgeltung aus der Ausgabe nicht bestimmbar. | `baseline-validity-unresolved` |

## Akzeptierte Transformationsregeln

Transformer `juris-sh-transformer/1.5.0` (`docs/SCHLESWIG_HOLSTEIN_TRANSFORMATION.md`): Landesname und Adjektiv → Niedersachsen-Holstein; belegte Normabkürzungen „… SH“ → „… NSH“ (Quellabkürzung bleibt als `amtliche-abkuerzung-sh`); 1.5.0: „SH“ an einer Normabkürzung oder Normbezeichnung („DSG SH“, „SH-BeamtVG“, „Mitbestimmungsgesetz Schl.-H.“) und als Landesbezug („in SH“) → „NSH“; Eigen-, Programm- und Systemnamen („Krebsregister SH“, „Standard-IT SH“), Aktenzeichen, Fundstellen, Blattnamen, Quellzitate, historische Namen, externe Kennungen und fehlerhafte Quellformen bleiben unverändert; nicht eindeutige Kürzel bleiben in Quellform. Keine Sim-Behörde erfunden.

## Akzeptierte Rücknahmen

Nach dem 01.12.2023 ausgefertigte, nur rückwirkend in Kraft gesetzte Normen gehören nicht zum Ausgangsrechtsstand (`docs/SIMULATION_IMPORT.md` 6.2): `jlr-NNLSH00002B9A`, `jlr-NNLSH00002BDA` (Spielbankabgabenverordnung 2025, EFGSH 2024); dazu zwölf 2024 erlassene, rückwirkende Verwaltungsvorschriften (nicht am Stichtag).

## Seeds und LBO

| Norm | Seed SHA-256 | Quell-Commit |
| --- | --- | --- |
| `gdg-nsh` | `a083633e30f66aab…` | `21bab36ec` |
| `laplag-nsh` | `9c606dad20fa8618…` | `21bab36ec` |
| `lbo-nsh` | `23b2f1e6cc606f2c…` | `21bab36ec` |
| `lkhg-nsh` | `47afa6995f9ef2c6…` | `f96e48df9` |
| `pog-nsh` | `18b9d657df04cbf5…` | `21bab36ec` |
| `sftg-nsh` | `2a184ff6902f1803…` | `21bab36ec` |

`lbo-nsh`: bisheriger Seed bleibt maßgeblich; die Bulk-Ausgabe ist nur ein anderer Parserausstoß ohne stärkere Evidenz (`data/simulation/nsh/lbo-baseline-seed-decision.md`). Alle Sim-Rezepte sind aus den Seeds reproduzierbar (Gate G4).

## Entscheidung

Mit der Freigabe gilt: `data/simulation/baseline-locks.json` → `jurisdictions.nsh` = `{ "commit": "<Commit dieses Stands>", "freeze": true }` für den Bestand mit dem Fingerabdruck `1b92d06468585d5d6bbb241b470638939520d96b1b7a7e0fffea514950548cf9`. Danach ändert sich eine NSH-Ausgangsfassung nur noch als Bugfix, mit neuer Evidenz, als Review-Entscheidung oder Schema-Upgrade (wie West); Sim-Fortschreibung bleibt davon unberührt.

