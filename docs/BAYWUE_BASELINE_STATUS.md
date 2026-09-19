# Stand des Stichtagsbestands Bayern-Württemberg

## Status: DEPLOYED (Teilbestand) · Stand 2026-09-19 (Run 10)

**1 700 Normen des bayerischen Landesrechts zum 2023-12-01 sind übergeleitet, archiviert, projiziert und
ausgeliefert:**

- 1 569, deren heutiger Text belegt der Stichtagstext ist;
- 70, deren Stichtagsfassung bewiesen zurückgerechnet ist: 56 über eine spätere Änderung, 14 über zwei oder
  mehr Änderungen mit Vorwärtsprobe (zwei davon mit Titeländerung); bei 21 davon (Run 7–10) nennen die
  Änderungsbefehle den alten Wortlaut nicht, er stammt aus der Stammverkündung und ist im Wortlaut gegen sie
  geprüft (`docs/BAYWUE_RECONSTRUCTION.md` §19);
- 61 heute nicht mehr geführte Stichtagsnormen, aus amtlichen Verkündungen wiederhergestellt
  (`docs/BAYWUE_BASELINE_ONLY.md`);
- **Entschieden (Nutzer, 2026-09-19): StRVertrBek (BayVV_1102_S_14148).** Die amtliche Verkündung BayMBl. 2023
  Nr. 585 bestimmt ausdrücklich das Inkrafttreten „mit Wirkung vom 8. November 2023“ und das Außerkrafttreten des
  Vorgängers (Erlass vom 11. Februar 2021, BayMBl. Nr. 164) mit Ablauf des 7. November 2023. Für den ex post
  rekonstruierten Rechtsstand gilt am 2023-12-01 die neue Fassung, obwohl die Bekanntmachung erst am 2023-12-06
  erschien. Regel 2c der Stichtagsklassifikation (Verwaltungsvorschrift, ausdrücklich bestimmte Wirksamkeit laut
  amtlicher Verkündung ≤ Stichtag), Beleg im Manifest (`gazette-publication`, stark, mit Verkündungsadresse),
  Regressionstest; der Review-Fall ist aufgelöst. Dieselbe Regel erfasst die AGZ-Richtlinie BayVV_787_L_14168
  (BayMBl. 2023 Nr. 595, „mit Wirkung vom 23. November 2023“): sie galt am Stichtag, ihr heutiger Text gilt aber
  erst seit 2025 – sie steht deshalb in der Rekonstruktionsqueue und wird nicht mit dem heutigen Text übernommen.

**Zurückgenommen (Run 9):** BayVV_7840_L_14146 (MStrVerbR). Die amtliche Verkündung BayMBl. 2023 Nr. 598 setzt sie
„mit Wirkung vom 15. Dezember 2023“ in Kraft und hebt keinen Vorgänger auf; die Portalangabe „inkraft 2023-11-15“
ist widerlegt. Stichtagsklasse `official-commencement-after-baseline`; der Slug `mstrverbr-baywue` ist stillgelegt
(ohne Nachfolger, nie neu vergeben), das archivierte Rohpaket bleibt in R2. Der Bulk nimmt eine übernommene Norm nur
mit genau dieser amtlich belegten Klasse zurück; jede andere Verschlechterung bleibt `import-regression`.

Der Stichtagsbestand ist damit **nicht vollständig**: 443 weitere heute geführte Normen galten am Stichtag
mit einem anderen oder nicht belegten Wortlaut, und heute fehlende Stichtagsnormen sind nur zum Teil
wiederhergestellt. Die
Oberfläche kennzeichnet den Bestand als Teilbestand (unten).

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
| davon als Anhang übernommen (BayBodSchO → EV-BodenseeSchO, redaktionelle Entscheidung) | 1 |
| davon im Scope | 2 342 |
| davon am Stichtag geltend | 2 090 |
| — heutiger Text **ist** der Stichtagstext → **übernommen** (einschließlich BayVwV96990 mit Quellkorrektur) | **1 569** |
| — heutiger Text ist jünger, Stichtagsfassung **rückgerechnet** (Rundlauf, belegter Beginn) → **übernommen** | **70** |
| — heutiger Text ist jünger → **Rekonstruktion nötig** | 443 |
| — Geltung belegt, Textbeginn nicht (BayVV_2230_7_1_K_10450) | 1 |
| davon Geltung am Stichtag unbestimmt | 13 |
| davon erst nach dem Stichtag erlassen | 239 |
| **Summe der Scope-Dokumente** | **2 342** |

Dazu kommen die **heute fehlenden Stichtagsnormen**. Das Ereignisregister – in Run 5 um den EuMedBek-Fehler
bereinigt: eine heute im Portal stehende Norm ist nie `baseline-only` – nennt 438 Kandidaten, 432 mit starker
Identität, 141 mit gefundener Ausgangsverkündung. **61 Normen** (72 Kandidaten, 23 Doppelerfassungen verbunden) sind
aus den amtlichen Verkündungen sicher wiederhergestellt (Stand Run 7), 12 erwiesen sich als nicht am Stichtag geltend,
21 als nicht Landesrecht (Veröffentlichungshinweise). Offen bleiben vor allem Vorschriften ohne elektronische
Ausgangsverkündung (295: 140 nur gedruckt, 136 nie verkündet, 17 Anlage nur als PDF, 2 Stammfassung nur als PDF),
32 mit unbestimmtem Glied und 6 mit unvollständiger Änderungskette.

Eine ehrliche Vollständigkeitsangabe ist deshalb: **1 700 von mindestens rund 2 500 Stichtagsnormen.**

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
Änderung deren Verkündung) als Quellreferenz und als in R2 archiviertes Rohdokument. Stammt Alttext aus der
Stammverkündung (21 Normen, 7 davon über die Vorwärtsrekonstruktion Stammverkündung + alle Änderungen bis zum Stichtag), sind auch sie und etwa vor dem Stichtag vorwärts angewandte Änderungen Quellreferenz
und archiviertes Rohdokument; der Bulk übernimmt ein solches Rezept nur, wenn jede dieser Verkündungen mit der
SHA-256 des Rezepts im Cache liegt (`restorationChecked`). Methode:
`docs/BAYWUE_RECONSTRUCTION.md`, Übernahmebedingungen: `docs/BAYWUE_HISTORICAL_BASELINE.md` Abschnitt 4.

Jede übernommene Norm hat die Textintegritätsprüfung bestanden (sichtbarer Quelltext gegen kanonischen Text;
Bulk und Inventur benutzen dieselbe Prüfung): im ganzen Korpus 0 `mismatch`, 0 `review`. Die vier früheren
Einzelfälle mit je einem unerklärten Zahlwort gingen auf verschmolzene Fußnotenzeichen zurück (Parser 0.2.0,
`docs/BAYERN_PARSER.md`).

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

Die Oberfläche zeigt die übernommenen Normen und kennzeichnet den Bestand sachlich als **Teilbestand**:
auf der Länderseite und bei Suchen, die BayWü einschließen, mit der Zahl der veröffentlichten Normen und der
bekannten, noch nicht belegten Stichtagsnormen; auf der Startseite als Kennzeichen an der Länderkarte.

Der Hinweis ist datengetrieben. `bayernrecht coverage --write` schreibt den Bestandsstand nach
`packages/legal-core/src/config/inventory-status.json` (`published`, `pending.atBaseline`,
`pending.baselineOnly`, `pending.undetermined`, `complete`). Die Komponente
`apps/web/src/components/InventoryNotice.astro` zeigt ihn nur, solange `complete` falsch ist; ein Land ohne
Eintrag (West) bekommt keinen Hinweis. Sobald alle bekannten Stichtagsnormen belegt übernommen sind, meldet der
Importer `complete: true`, und der Hinweis verschwindet mit dem nächsten Deployment – ohne Codeänderung.
