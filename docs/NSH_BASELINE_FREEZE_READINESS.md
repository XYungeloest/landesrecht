# Freeze-Readiness des NSH-Ausgangsrechtsstands

Automatisch erzeugt von `node scripts/nsh-freeze-readiness.ts --write` (Stand der Arbeitskopie, Vorher-Stand: Review-Fälle im Commit `a7325a736`). Nicht von Hand bearbeiten; Freeze-Semantik: `docs/SIMULATION_IMPORT.md` (Abschnitt „Baseline-Freeze“).

**Status: NOT READY** · Freeze **nicht gesetzt** (`data/simulation/baseline-locks.json`, `jurisdictions.nsh.freeze`) · Sim-Quellenstatus getrennt: `SIM SOURCES PARTIAL` (kein Blocker des Ausgangsrechtsstands)

Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist; `READY WITH HUMAN REVIEW`, wenn nur fachliche Entscheidungen offen sind; `BASELINE READY`, wenn auch diese entschieden sind. Nicht sperrend sind Fälle, die den normativen Ausgangstext nicht berühren (nichtnormative Anlage). Der Freeze selbst wird nur auf ausdrückliche Entscheidung gesetzt.

## 1 Bestand

| Kennzahl | Wert |
| --- | --- |
| Baseline-Normen (juris, Ausgangsrechtsstand) | 2.611 |
| davon mit Sim-Folgefassungen | 5 |
| per-Norm-Seeds (gelockte Sim-Ziele) | 6 |
| eigene Normen der Simulation (nicht Baseline) | 33 |
| Normen mit Tabellen / Tabellen (Ausgangsfassung) | 288 / 712 |

Normtypen der Baseline: verwaltungsvorschrift 1.134 · verordnung 936 · gesetz 493 · zustimmungsgesetz 47 · verfassung 1

Manifest (Vollkorpus): imported-with-warnings 2.065 · not-at-baseline 1.739 · imported 546 · excluded 476 · needs-review 369

## 2 Ausgangsfassung: exakt oder rekonstruiert

| Herkunft der Stichtagsfassung | Normen |
| --- | ---: |
| heutige Ausgabe, am Stichtag unverändert (exakt) | 2.282 |
| aus juris-Einzelfassungen zusammengesetzt | 329 |

Textintegrität (Vollkorpus, `coverage.json`): exact 2.898 · normalized 0 · explained 2.291 · review 3 · mismatch 3; übernommen wird nur `exact` oder erklärt (`explained`), Abweichungen bleiben Review.

## 3 Offene Review-Fälle

| Kategorie | vorher | jetzt |
| --- | ---: | ---: |
| historical-gap | 13 | 13 |
| import-regression | 4 | 6 |
| incomplete-annex | 92 | 92 |
| institution-mapping | 77 | 75 |
| pdf-only | 30 | 30 |
| reconstruction-required | 12 | 0 |
| unknown-structure | 212 | 187 |
| validity | 11 | 11 |

Gesamt 451 → 414 Fälle in 374 Dokumenten. Blockierend: 3 technisch, 411 fachlich; nicht sperrend: 0.

### 3.1 Technische Blocker

| Gruppe | Fälle | Dokumente | Entscheidung | Beispiele |
| --- | ---: | ---: | --- | --- |
| Textintegrität: Abweichung | 3 | 3 | Zeichenverlust im Parser beheben | jlr-NNLSH00002B0A, jlr-NNLSH000032B5, VVSH-VVSH000007921 |

### 3.2 Fachliche Entscheidungen (Human Review)

| Gruppe | Fälle | Dokumente | Entscheidung | Beispiele |
| --- | ---: | ---: | --- | --- |
| Tabelle ohne sicheres Raster | 179 | 179 | Tabellenstruktur manuell bestätigen oder Fassung ohne Tabellenstruktur freigeben | jlr-NNLSH00002A8B, jlr-NNLSH00002A8C, jlr-NNLSH00002A90, jlr-NNLSH00002A9B, jlr-NNLSH00002AA7, jlr-NNLSH00002AB0 |
| normative Anlage nur als nicht zugängliche PDF-Datei | 79 | 79 | normative Anlage fehlt: amtliche Veröffentlichung beschaffen oder Norm im Review lassen (keine OCR-Automatik) | jlr-NNLSH00002A7D, jlr-NNLSH00002A8A, jlr-NNLSH00002A8B, jlr-NNLSH00002A8C, jlr-NNLSH00002B46, jlr-NNLSH00002BCC |
| Einrichtung, Programm oder System mit Landeskürzel | 30 | 30 | Kürzel „SH“: amtliche Abkürzung belegen (dann Überleitung nach bestehender Regel) oder als Quellbezeichnung (Provenienz) stehen lassen | jlr-NNLSH00002B0A, jlr-NNLSH00003021, jlr-NNLSH0000315B, jlr-NNLSH000033FC, VVSH-VVSH000000106, VVSH-VVSH000000215 |
| Normabkürzung mit Landeskürzel (ohne amtlichen Beleg) | 18 | 18 | Kürzel „SH“: amtliche Abkürzung belegen (dann Überleitung nach bestehender Regel) oder als Quellbezeichnung (Provenienz) stehen lassen | jlr-NNLSH00002AA7, jlr-NNLSH00002AB9, jlr-NNLSH00002AEE, jlr-NNLSH00002B49, jlr-NNLSH00002E83, jlr-NNLSH00003283 |
| Landeskürzel als Landesbezeichnung | 16 | 16 | Kürzel „SH“: amtliche Abkürzung belegen (dann Überleitung nach bestehender Regel) oder als Quellbezeichnung (Provenienz) stehen lassen | jlr-NNLSH00002A82, jlr-NNLSH00002AC6, jlr-NNLSH00002B40, jlr-NNLSH00002BB6, jlr-NNLSH00003012, jlr-NNLSH0000301E |
| technischer Vermerk: Text unvollständig | 16 | 16 | Abbildung bzw. fehlenden Text anhand der Quelle bestätigen | jlr-NNLSH00002C03, jlr-NNLSH00002DC4, jlr-NNLSH00002E3E, jlr-NNLSH000033C6, jlr-NNLSH000033C8, jlr-NNLSH000033DA |
| Abbildung nicht sicher zuzuordnen | 14 | 14 | Abbildung bzw. fehlenden Text anhand der Quelle bestätigen | jlr-NNLSH00002A9B, jlr-NNLSH00002B24, jlr-NNLSH00003022, jlr-NNLSH00003086, jlr-NNLSH000030EF, jlr-NNLSH00003148 |
| Zuordnung unklar | 12 | 12 | Stammnorm der Anlage bestimmen | VVSH-VVSH000003938, VVSH-VVSH000003939, VVSH-VVSH000003940, VVSH-VVSH000009113, VVSH-VVSH000009120, VVSH-VVSH000009121 |
| Landesbezeichnung im Eigennamen oder Quelltextfehler | 11 | 11 | Schutzmuster (Eigenname, historische Bezeichnung) oder Überleitung festlegen – keine Sim-Behörde erfinden | jlr-NNLSH00002B14, jlr-NNLSH00002BEC, jlr-NNLSH00003019, VVSH-VVSH000001798, VVSH-VVSH000002117, VVSH-VVSH000002248 |
| nur rückwirkende Einzelfassung am Stichtag | 7 | 7 | Stichtagsfassung aus juris-Einzelfassung, amtlicher historischer Veröffentlichung oder sicherer Ereignisrekonstruktion bestimmen | jlr-NNLSH00002A85, jlr-NNLSH00002B50, jlr-NNLSH00002D16, jlr-NNLSH00002D19, jlr-NNLSH00002D1E, jlr-NNLSH00002D2F |
| Register (Ende) gegen Fortbestand | 7 | 7 | Geltung am 01.12.2023 aus „Gültig ab/bis“ oder amtlicher Quelle entscheiden | jlr-NNLSH00002AB7, jlr-NNLSH00002C62, jlr-NNLSH00002EE1, jlr-NNLSH00003220, jlr-NNLSH00003378, jlr-NNLSH000033F7 |
| zwei Einzelfassungen am Stichtag | 4 | 4 | Stichtagsfassung aus juris-Einzelfassung, amtlicher historischer Veröffentlichung oder sicherer Ereignisrekonstruktion bestimmen | jlr-NNLSH00002AD5, jlr-NNLSH00002BD8, jlr-NNLSH00002CBA, jlr-NNLSH00002D5C |
| Geltung am Stichtag unbestimmt | 4 | 4 | Geltung am 01.12.2023 aus „Gültig ab/bis“ oder amtlicher Quelle entscheiden | jlr-NNLSH00002E40, VVSH-VVSH000000254, VVSH-VVSH000002029, VVSH-VVSH000002031 |
| Quelle: Fußnotenzeichen ohne Text | 3 | 3 | Übernahme ohne Fußnotentext bestätigen | jlr-NNLSH00002CDF, jlr-NNLSH00003481, VVSH-VVSH000007921 |
| zurückgenommen: Tabellenstruktur nicht belegt | 3 | 3 | Tabellenstruktur manuell bestätigen oder als Text übernehmen | jlr-NNLSH00002D5A, jlr-NNLSH00002FEB, VVSH-VVSH000007767 |
| Einheitenfolge der Einzelfassungen | 2 | 2 | Stichtagsfassung aus juris-Einzelfassung, amtlicher historischer Veröffentlichung oder sicherer Ereignisrekonstruktion bestimmen | jlr-NNLSH00002AC2, jlr-NNLSH00002AE9 |
| Textintegrität: Einzelzeichen prüfen | 2 | 2 | Abweichung von einem Zeichen bestätigen | jlr-NNLSH00002B5D, jlr-NNLSH00003481 |
| zurückgenommen: am Stichtag nicht geltend | 2 | 2 | Rücknahme bestätigen (nach dem Stichtag ausgefertigt bzw. davor außer Kraft; kein Ausgangsrechtsstand) | jlr-NNLSH00002B9A, jlr-NNLSH00002BDA |
| Normtext vollständig fehlend | 1 | 1 | normative Anlage fehlt: amtliche Veröffentlichung beschaffen oder Norm im Review lassen (keine OCR-Automatik) | jlr-NNLSH00002B17 |
| Seed-Konflikt (fortgeschriebene Norm) | 1 | 1 | Baselinekorrektur einer durch die Simulation fortgeschriebenen Norm: Seed neu annehmen oder Korrektur verwerfen (Konfliktbericht) | jlr-NNLSH00002D48 |

### 3.3 Nicht sperrend

keine

## 4 Tabellen

Offene Tabellenfälle nach Ablehnungsgrund (mehrfach je Fall): `columns-vary` 53, `row-before-table` 52, `header-unassigned` 51, `hyphenated-cell` 50, `no-gutter` 45, `cell-unassigned` 39, `ambiguous-row-gap` 36, `page-break-in-table` 14, `single-row` 7, `too-many-columns` 3, `figure-inside` 1. Regressionsschutz: `npm run content:tables` (semantischer Fingerabdruck jeder Tabelle, Freigaben in `data/content-table-changes.json`, 16 begründete Änderungen).

## 5 Anlagen (`incomplete-annex`)

| Untergruppe | Fälle | sperrend |
| --- | ---: | --- |
| Stammnorm vollständig, nur nichtnormative Anlage fehlt | 0 | nein |
| normative Anlage separat vorhanden | 0 | technisch |
| normative Anlage nur als nicht zugängliche PDF-Datei | 79 | fachlich |
| Zuordnung unklar | 12 | fachlich |
| Normtext vollständig fehlend | 1 | fachlich |

Normativ ist eine Anlage im Zweifel immer (Muster, Karten, Formulare, Tarife); nur die ausdrückliche Kennzeichnung im Anlagentitel („nachrichtlich“, „Erläuterungen“, „Hinweise“, „Beispiel“, „Anschriften“) macht sie nichtnormativ. Keine OCR, keine Übernahme einer Stammnorm, deren normativer Teil fehlt.

## 6 Gates und Audits

| Gate | Ergebnis | Detail |
| --- | --- | --- |
| audit | grün | 7/7 Prüfungen |
| readiness | grün | TECHNICALLY READY |
| search-audit-full | grün | 2.642 Normen, 85.911 Sucheinheiten |
| d1-remote | grün | landesrecht-nsh, Stichprobe 30, 0 Abweichungen (2026-09-29) |
| r2 | grün | 2.611 Einträge, 10.372 Objekte, Konflikte 0 |
| contradictory-evidence | grün | 0 offen (muss 0 sein) |

## 7 Unveränderlichkeit, Seeds und Ausnahmen

- Baseline-Lock NSH: Referenz-Commit `a7325a736e2c`, Freeze nicht gesetzt; per-Norm-Seeds (gelockte Sim-Ziele): `gdg-nsh`, `laplag-nsh`, `lbo-nsh`, `lkhg-nsh`, `pog-nsh`, `sftg-nsh`.
- Fortgeschriebene juris-Normen (Folgefassungen im Bestand): `gdg-nsh`, `laplag-nsh`, `lbo-nsh`, `lkhg-nsh`, `sftg-nsh`.
- Akzeptierte Baseline-Ausnahmen (`data/content-immutability-exceptions.json`, NSH-Einträge je Block): `21bab36ec` 219 · `7d584576b` 0 · `a7325a736` 22.

## 8 Sim-Quellenlücken (getrennt, kein Blocker)

Sim-Quellenstatus `SIM SOURCES PARTIAL`: 2/2 Ausgaben; 1/1 Ausgaben; 2/2 Ausgaben. Die Lücken betreffen die Fortschreibung nach dem Stichtag, nicht den Ausgangsrechtsstand.

