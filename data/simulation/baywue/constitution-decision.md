# BayWü: Verfassungsidentität – Entscheidung (Stand 2026-09-28)

Frage: Sind die „Staatsverfassung Bayern-Württembergs“ vom 12. Januar 2025 (Sim) und die Baseline-Verfassung dieselbe
Norm (neue Fassung) oder ersetzt die Sim-Verfassung die Baseline (neue Normidentität, `replaces`/`replaced-by`)?

**Entscheidung: neue Normidentität.** Die Staatsverfassung vom 12. Januar 2025 ist die Norm
`staatsverfassung-2025-baywue`; die übernommene Verfassung `verfassung-des-freistaates-bayern-wuerttemberg` tritt mit
Ablauf des 11. Januar 2025 außer Kraft (`replaced-by`). Grundlage ist ausschließlich der Verfassungstext und die
vorhandenen Sim-Belege, nicht die Ähnlichkeit von Titeln oder Artikeln.

## 1 Quelle

| Merkmal | Befund |
| --- | --- |
| Datei | `baywü/Staatsverfassung_Bayern_Württemberg.pdf` (hashidentisch: `baywü/Landesverfassung_Bayern-Württemberg (2).pdf`), SHA-256 `70f670de35fb…15bf0d`, 28 Seiten, Textebene vorhanden, erzeugt am 12. Januar 2025 |
| Titel wie gedruckt | „Staatsverfassung Bayern-Württembergs“ |
| Verfassunggeber | Kopf jeder Seite „Süddeutscher Landtag“; Präambel: „hat sich das Bayern-Württembergische Volk kraft seiner verfassungsgebenden Gewalt diese Verfassung gegeben“; Artikel 92 Absatz 1 nennt die „verfassunggebende Landesversammlung“ |
| Ausfertigung | „Ausgefertigt am 12.01.2025“ (Kopf jeder Seite) |
| Inkrafttreten | Artikel 92 Absatz 2 Satz 1: „am Tage ihrer Verkündung“ |
| Staatsbezeichnung | Artikel 23 Absatz 1: „Der Freistaat Bayern-Württemberg ist ein republikanischer, demokratischer und sozialer Rechtsstaat“; Präambel „Bayern-Württembergische Volk“; Artikel 2 Absatz 2 „Volk von Bayern-Württemberg“; Artikel 92 Absatz 3 „Organe des Freistaates Bayern-Württemberg“. „Süddeutschland“ kommt im Normtext nicht vor |
| Gliederung | Präambel; Erster Hauptteil (I–III, Artikel 1–22); Zweiter Hauptteil (I–VII, Artikel 23–84); Schlussbestimmungen (Artikel 85–92); 99 Artikel einschließlich 2b, 2c, 3b, 3c, 3d, 34a, 35a |
| Aufhebung/Ersetzung | Artikel 92 Absatz 2 Satz 2: „Zum gleichen Zeitpunkt treten die Verfassungen der bisherigen Länder Baden-Württemberg und dem Freistaat Bayern außer Kraft.“ |
| Übergangsvorschriften | Artikel 87 (früheres Recht als Landesrecht), 88 (erste Wahl des Verfassungsgerichtshofs), 89 (Polizeiorganisation), 90 (Beamte der bisherigen Länder), 92 Absatz 3 (sonstiges Recht der bisherigen Länder bleibt bestehen; Organe des Freistaates treten an die Stelle der bisherigen) |
| Verkündungsbeleg | kein Blatt mit dem Verfassungstext; die Bekanntmachung vom 12. Januar 2025 ist durch verkündete Akte belegt: StRGVV (GVBl. BayWü 2025 Nr. 3 S. 10, `255405100a67…`: „in der Fassung der Bekanntmachung vom 12. Januar 2025“), StRGO 2026, fünf Änderungsgesetze 2026 („vom 12. Januar 2025“) |

## 2 Verhältnis zur Baseline-Verfassung

- Die Baseline-Norm ist die übernommene Bayerische Verfassung in der Fassung der Bekanntmachung vom 15. Dezember 1998
  (Namensübertragung zum 1. Dezember 2023): Aufbau „Erster Hauptteil – Aufbau und Aufgaben des Staates“, Abschnitte mit
  arabischer Zählung, Art. 44 Wahl des Ministerpräsidenten, Art. 28 Immunität.
- Die Staatsverfassung 2025 hat einen anderen Aufbau („Vom Menschen und seinen Ordnungen“, „Vom Staat und seinen
  Ordnungen“), eine eigene Artikelfolge und eigene Schluss- und Übergangsvorschriften. Sie gibt sich als Akt der
  verfassungsgebenden Gewalt aus und setzt die Verfassungen der bisherigen Länder ausdrücklich außer Kraft.
- Sie bezeichnet sich nicht als Neufassung oder Änderung einer fortbestehenden Verfassung. Die Formel „in der Fassung der
  Bekanntmachung vom 12. Januar 2025“ in späteren Akten bezeichnet die Bekanntmachung dieser Verfassung, nicht eine
  Neubekanntmachung der Baseline-Verfassung.

Folge: neue Normidentität mit `replaces` auf die Baseline-Verfassung; die Baseline-Datei `versions/2023-12-01.json`
bleibt byteidentisch, ihr Geltungsende wird abgeleitet (Rezept `repealLaw`, Hash über `{ title, body }`).

## 3 Prüfung gegen die fünf Änderungsgesetze

Jeder Änderungsbefehl trifft im Text vom 12. Januar 2025 genau die adressierte Stelle (Hash bzw. Alttext im Rezept):

| Wirkdatum | Akt | Verkündung | Befehle | Ergebnis |
| --- | --- | --- | --- | --- |
| 2026-05-29 | Erstes Gesetz zur Änderung der Staatsverfassung | GVBl. BayWü 2026 Nr. 1 S. 9 | Art. 46, 47, 54 neu gefasst; Art. 54a eingefügt; Art. 55 Abs. 2 neu, Abs. 3 aufgehoben | Fassung `2026-05-29` (Rezept 1 des Tages) |
| 2026-05-29 | Zweites Gesetz zur Änderung der Staatsverfassung | GVBl. BayWü 2026 Nr. 1 S. 11 | Art. 26 aufgehoben; Art. 28 neu; Art. 38 Abs. 1 neu; Art. 59 Abs. 2 Satz 3 neu; Art. 60 Abs. 2 aufgehoben, Abs. 3 neu (im Blatt als „(2)“ bezeichnet, so übernommen); Art. 64 Abs. 2 und 3 neu | Fassung `2026-05-29` (Rezept 2 des Tages) |
| 2026-06-26 | Gesetz zur Änderung der Staatsverfassung (Art. 24) | GVBl. BayWü 2026 Nr. 2 S. 9 | Art. 24 Abs. 3 neu (Alttext „Die Hauptstadt ist München.“) | Fassung `2026-06-26` |
| 2026-06-27 | Gesetz zur Änderung der Staatsverfassung (Art. 45) | GVBl. BayWü 2026 Nr. 2 S. 6 | Art. 45 Abs. 2 Satz 3 gestrichen; Abs. 3 neu | Fassung `2026-06-27` |
| 2026-08-29 | Fünftes Gesetz zur Änderung der Staatsverfassung | GVBl. BayWü 2026 Nr. 3 S. 4 | Art. 46 Abs. 5 angefügt (Art. 46 hat nach dem Ersten Änderungsgesetz vier Absätze) | Fassung `2026-08-29` |

Die Fassungen `2025-01-12`, `2026-05-29`, `2026-06-26`, `2026-06-27` und `2026-08-29` sind aus Akt und Rezepten
reproduzierbar (`npm run import:simulation:consolidate -- --jurisdiction baywue --check`).

## 4 Wirkdatum und Quellenstatus (Entscheidung 2026-09-29)

**Verbindlich: `staatsverfassung-2025-baywue` gilt ab 12. Januar 2025** (Nutzerentscheidung). Gründe: Artikel 92
Absatz 2 knüpft das Inkrafttreten an den Tag der Verkündung; spätere amtliche Sim-Veröffentlichungen bezeichnen die
Verfassung durchgehend als Bekanntmachung vom 12. Januar 2025; keine widersprechende Evidenz liegt vor. Der
Rechtsstand wird nicht blockiert, die fünf Folgeänderungen bleiben angewandt.

Quellenstatus (in `meta.editorialResolutions`, `kind: source-status`): Wortlaut nach dem ausgefertigten Einzeldokument
(Ebene 2); Verkündung durch die **Mitteilung des Bayerisch-Württembergischen Justizministeriums „Verkündung der
Verfassung“** belegt (`baywü/verkündung120125.txt`, `d4711c710d8c…`, gez. Justizminister Christian Lehrmann; Ebene 2,
seit Lauf 15 im Archiv). Die Mitteilung trägt kein Datum; die Ziffern im Dateinamen werden nicht verwendet. Das Datum
12. Januar 2025 ist mittelbar amtlich belegt (Ebene 3: GVBl. BayWü 2025 Nr. 3 S. 10). **Das Original-Verkündungsblatt
im Sinne von Artikel 92 Absatz 1 fehlt weiterhin** und bleibt im Publikationsinventar als fehlende Primärquelle.

## 5 Offene Punkte

- Original-Verkündungsblatt der Verfassung (siehe 4).
- Das Änderungsgesetz zu Artikel 24 nennt eine Änderung „am 07. Mai 2026“. Das Blattverzeichnis (`gvbl.wiki`,
  Sekundärquelle) führt für 2026 genau die fünf vorliegenden Änderungsgesetze; die Alttexte schließen lückenlos an. Ein
  weiterer Akt ist nicht belegt.
- Die Beziehungsnotizen der fünf Änderungsakte („Slug vorläufig, Rezept gesperrt“) bleiben gespeichert (Additivität);
  seit 2026-09-29 sind sie durch `editorialResolutions` (`superseded-technical-note`) als überholt gekennzeichnet –
  maßgeblich ist das angewandte Rezept.
