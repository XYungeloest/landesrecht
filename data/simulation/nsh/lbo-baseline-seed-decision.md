# LBO – Entscheidung über den Baseline-Seed (Lauf 17, 2026-09-29)

Norm `lbo-nsh` (juris `jlr-NNLSH00002D48`, Landesbauordnung), durch die Simulation fortgeschrieben: Sim-Fassung
`versions/2026-09-03.json` aus dem Rezept `data/simulation/nsh/amendments/gesetz-zur-aenderung-der-landesbauordnung-photovoltaikpflicht-nsh/lbo-nsh.json`
(§ 41a Photovoltaikpflicht eingefügt, Operation `insertProvisionAfter` hinter § 41, Abschnitt 5). Offener Review-Fall
`import-regression`/`baseline-locked`: Der Bulk ergäbe eine abweichende Ausgangsfassung.

## Varianten

| | akzeptierter Seed (maßgeblich) | Bulk-Vorschlag Lauf 17 (nicht maßgeblich) |
| --- | --- | --- |
| Datei | `content/norms/nsh/lbo-nsh/versions/2023-12-01.json` | nicht geschrieben (Erzeugung mit dem Importer, Stand Lauf 17) |
| SHA-256 | `23b2f1e6cc606f2c5e981af429d743afc910d585f0cee80fa1ae22754812811a` | `2a7cf231f80a342c1591959798c2b48a5749af559b1eb1d9a2420f9baa9759c3` |
| Herkunft | Referenz-Commit `21bab36ec` (Seed `acceptedAt` 2026-09-28, Migration Lock-Schema 2); geschrieben in Commit `cdf352630` | Parser/Zusammensetzung Lauf 17 |
| Quelle | juris, Stichtagsfassung aus 114 Einzelfassungen (`jlr-NNLSH00002D48`), Geltung der Quellfassung 2022-09-01 bis 2024-07-04 | **dieselbe** Quelle: dieselben 114 Einzelfassungen, identische `sourceReferences` |
| Blöcke | paragraph 94 · subparagraph 332 · item 415 · subitem 87 · paragraphText 87 · heading 2 · section 3 | paragraph 94 · subparagraph 332 · item 411 · subitem 93 · paragraphText 91 · section 3 |
| Wortlaut | 24 362 Wörter | 24 362 Wörter; Buchstaben-/Ziffernfolge ohne Gliederungszeichen gleich |

## Struktureller und textlicher Unterschied

23 Blöcke nur im Seed, 27 nur im Vorschlag. Der Wortlaut ist gleich; es unterscheiden sich allein Blockgrenzen und
Gliederungsebenen:

- **Vorschlag besser:** Aufzählungen „c) mindestens 2 m …“ (§ 6) und „c) Sprungschanzen …“ bis „g) Wohnwagen …“ (§ 63)
  sowie die Unterpunkte von Nr. 11 und Nr. 12 stehen als Unterpunkte (`subitem`) statt als Überschrift bzw. eine Ebene zu hoch.
- **Vorschlag schlechter:** In § 2 Abs. 11 Nr. 1 wird der Punkt mitten im Wort geteilt („… der Ver-“ / Textblock
  „ordnung (EU) Nummer 305/2011 …“); die Überschriften von § 8 („Nicht überbaute Flächen der bebauten Grundstücke,
  Kleinkinderspielplätze“) und § 16c („Anforderungen für die Verwendung von CE-gekennzeichneten Bauprodukten“) stehen
  als Textblock statt als Titel der Einheit; in § 72 wird ein Satzende („… bereitgestellt wird.1“) abgetrennt.

Vollständige Blockliste (gekürzt auf 220 Zeichen je Block):

```text
--- nur bisheriger Seed (23)
-   item 1.:  Produkte, Baustoffe, Bauteile und Anlagen sowie Bausätze gemäß Artikel 2 Nummer 2 der Verordnung (EU) Nummer 305/20111 , die hergestellt werden, um dauerhaft in bauliche Anlagen eingebaut zu werden,
-  heading:  c) mindestens 2 m von der gegenüberliegenden Nachbargrenze entfernt bleiben,
-  item 3.:  bei Gebäuden an der Grundstücksgrenze die Seitenwände von Vorbauten und Dachaufbauten, auch wenn sie nicht an der Grundstücksgrenze errichtet werden.
- paragraph § 8: Nicht überbaute Flächen der bebauten Grundstücke, Kleinkinderspielplätze 
- paragraph § 16c: Anforderungen für die Verwendung von CE-gekennzeichneten Bauprodukten 
-   heading:  c) Sprungschanzen, Sprungtürme und Rutschbahnen mit einer Höhe bis zu 10 m,
-   item d):  Stege,
-   item e):  Anlagen, die der zweckentsprechenden Einrichtung von Spiel-, Abenteuerspiel-, Bolz- und Sportplätzen, Reit- und Wanderwegen, Trimm- und Lehrpfaden dienen, ausgenommen Gebäude und Tribünen,
-   item f):  Anlagen, die der Gartennutzung, der Gartengestaltung oder der zweckentsprechenden Einrichtung von Gärten dienen, ausgenommen Gebäude und Einfriedungen,
-   item g):  Wohnwagen, Zelte und nach § 2 Absatz 3 Satz 2 und 3 der Camping- und Wochenendplatzverordnung zulässige bauliche Anlagen auf Standplätzen von genehmigten Campingplätzen;
-   item 11.:  folgende tragende und nichttragende Bauteile:
-    subitem a):  nichttragende und nichtaussteifende Bauteile in baulichen Anlagen,
-    subitem b):  Fenster und Türen sowie die dafür bestimmten Öffnungen bis zu einer Breite von 2 m bei oberirdischen Gebäuden der Gebäudeklassen 1 und 2,
-    subitem c):  Außenwandbekleidungen einschließlich Maßnahmen der Wärmedämmung und Verblendungen, ausgenommen bei oberirdischen Gebäuden der Gebäudeklassen 4 und 5 sowie Hochhäusern, und Verputz baulicher Anlagen,
-    subitem d):  Bedachung einschließlich Maßnahmen der Wärmedämmung ausgenommen bei oberirdischen Gebäuden der Gebäudeklassen 4 und 5 sowie Hochhäusern;
-   item 12.:  folgende Werbeanlagen, soweit sie nicht an Kulturdenkmalen oder im Umgebungsschutzbereich von Kulturdenkmalen angebracht oder aufgestellt werden:
-    subitem a):  Werbeanlagen mit einer Ansichtsfläche bis zu 1 m 2 ,
-    subitem b):  Warenautomaten,
-    subitem c):  Werbeanlagen, die nach ihrem erkennbaren Zweck nur vorübergehend für höchstens zwei Monate angebracht werden; im Außenbereich nur soweit sie einem landwirtschaftlichen Betrieb dienen,
-    subitem d):  Werbeanlagen, die an der Stätte der Leistung vorübergehend angebracht oder aufgestellt werden, soweit sie nicht mit dem Boden oder einer baulichen Anlage verbunden sind,
-    subitem e):  Schilder, die Inhaberinnen oder Inhaber und Art gewerblicher Betriebe kennzeichnen (Hinweisschilder), wenn sie vor Ortsdurchfahrten auf einer einzigen Tafel zusammengefasst sind,
-    subitem f):  Werbeanlagen in durch Bebauungsplan festgesetzten Gewerbe-, Industrie- und vergleichbaren Sondergebieten an der Stätte der Leistung mit einer Höhe bis zu 10 m über der festgelegten Geländeoberfläche,
-   subparagraph (2):  Die Baugenehmigung bedarf der Schriftform; sie ist nur insoweit zu begründen, als Abweichungen, Ausnahmen oder Befreiungen von nachbarschützenden Vorschriften zugelassen werden und die Nachbarin oder
+++ nur Bulk-Vorschlag (27)
+   item 1.:  Produkte, Baustoffe, Bauteile und Anlagen sowie Bausätze gemäß Artikel 2 Nummer 2 der Ver-
+  paragraphText:  ordnung (EU) Nummer 305/20111 , die hergestellt werden, um dauerhaft in bauliche Anlagen eingebaut zu werden,
+    subitem c):  mindestens 2 m von der gegenüberliegenden Nachbargrenze entfernt bleiben,
+   item 3.:  bei Gebäuden an der Grundstücksgrenze die Seitenwände von Vorbauten und Dachaufbauten, auch wenn sie nicht an der Grundstücksgrenze errichtet werden.
+ paragraph § 8:  
+  paragraphText:  Nicht überbaute Flächen der bebauten Grundstücke, Kleinkinderspielplätze
+ paragraph § 16c:  
+  paragraphText:  Anforderungen für die Verwendung von CE-gekennzeichneten Bauprodukten
+     subitem c):  Sprungschanzen, Sprungtürme und Rutschbahnen mit einer Höhe bis zu 10 m,
+     subitem d):  Stege,
+     subitem e):  Anlagen, die der zweckentsprechenden Einrichtung von Spiel-, Abenteuerspiel-, Bolz- und Sportplätzen, Reit- und Wanderwegen, Trimm- und Lehrpfaden dienen, ausgenommen Gebäude und Tribünen,
+     subitem f):  Anlagen, die der Gartennutzung, der Gartengestaltung oder der zweckentsprechenden Einrichtung von Gärten dienen, ausgenommen Gebäude und Einfriedungen,
+     subitem g):  Wohnwagen, Zelte und nach § 2 Absatz 3 Satz 2 und 3 der Camping- und Wochenendplatzverordnung zulässige bauliche Anlagen auf Standplätzen von genehmigten Campingplätzen;
+    item 11.:  folgende tragende und nichttragende Bauteile:
+     subitem a):  nichttragende und nichtaussteifende Bauteile in baulichen Anlagen,
+     subitem b):  Fenster und Türen sowie die dafür bestimmten Öffnungen bis zu einer Breite von 2 m bei oberirdischen Gebäuden der Gebäudeklassen 1 und 2,
+     subitem c):  Außenwandbekleidungen einschließlich Maßnahmen der Wärmedämmung und Verblendungen, ausgenommen bei oberirdischen Gebäuden der Gebäudeklassen 4 und 5 sowie Hochhäusern, und Verputz baulicher Anlagen,
+     subitem d):  Bedachung einschließlich Maßnahmen der Wärmedämmung ausgenommen bei oberirdischen Gebäuden der Gebäudeklassen 4 und 5 sowie Hochhäusern;
+    item 12.:  folgende Werbeanlagen, soweit sie nicht an Kulturdenkmalen oder im Umgebungsschutzbereich von Kulturdenkmalen angebracht oder aufgestellt werden:
+     subitem a):  Werbeanlagen mit einer Ansichtsfläche bis zu 1 m 2 ,
+     subitem b):  Warenautomaten,
+     subitem c):  Werbeanlagen, die nach ihrem erkennbaren Zweck nur vorübergehend für höchstens zwei Monate angebracht werden; im Außenbereich nur soweit sie einem landwirtschaftlichen Betrieb dienen,
+     subitem d):  Werbeanlagen, die an der Stätte der Leistung vorübergehend angebracht oder aufgestellt werden, soweit sie nicht mit dem Boden oder einer baulichen Anlage verbunden sind,
+     subitem e):  Schilder, die Inhaberinnen oder Inhaber und Art gewerblicher Betriebe kennzeichnen (Hinweisschilder), wenn sie vor Ortsdurchfahrten auf einer einzigen Tafel zusammengefasst sind,
+     subitem f):  Werbeanlagen in durch Bebauungsplan festgesetzten Gewerbe-, Industrie- und vergleichbaren Sondergebieten an der Stätte der Leistung mit einer Höhe bis zu 10 m über der festgelegten Geländeoberfläche,
+   subparagraph (2):  Die Baugenehmigung bedarf der Schriftform; sie ist nur insoweit zu begründen, als Abweichungen, Ausnahmen oder Befreiungen von nachbarschützenden Vorschriften zugelassen werden und die Nachbarin oder
+   paragraphText:  kel 16 des Gesetzes vom 28. Juni 2021 (BGBl. I S. 2250), bereitgestellt wird.1
```

## Grund der Abweichung

Reine Parser-/Zusammensetzungsunterschiede zwischen dem Stand des Seeds (Parser Run 8/9) und dem heutigen Parser
(Aufzählungsebenen, Seitenwechsel in Einzelfassungen, Titelerkennung in Einzelfassungen). Keine neue oder stärkere
Evidenz: Quelle, Einzelfassungen und Stichtagsauswahl sind identisch; der Wortlaut stimmt überein.

## Auswirkung auf das Sim-Rezept vom 03.09.2026

Das Rezept zielt auf § 41 in Abschnitt 5 (`expectedHash` 22322eba…); § 41 ist in beiden Varianten byteidentisch. Das
Rezept wäre auf beide anwendbar. Mit dem bisherigen Seed bleibt die Sim-Fassung 2026-09-03 unverändert und reproduzierbar
(`import:simulation:consolidate -- --jurisdiction nsh --check`, Gate G4 grün).

## Entscheidung

**Bisheriger Seed bleibt maßgeblich.** Die Bulk-Ausgabe für `lbo-nsh` ist ausdrücklich nicht maßgeblich
(`baseline-seed-authoritative`): Sie ist nicht durch bessere Primär- oder juris-Evidenz gestützt, sondern nur ein
anderer Parserausstoß mit Verbesserungen und Verschlechterungen. Kein neuer Seed, keine Änderung der Ausgangsfassung,
kein Sim-Recht verloren. Der Review-Fall `baseline-locked` ist mit `resolved-excluded` / `baseline-seed-authoritative`
entschieden und zählt nicht mehr als offene Entscheidung. Eine spätere Korrektur der Seed-Fassung (etwa der zu hoch
eingeordneten Aufzählungen) braucht eine ausdrückliche neue Seed-Freigabe.
