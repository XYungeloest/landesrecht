# RECHT.NRW Bulkimport – Fälle `import-regression` (LRGV, Stichtag 2023-12-01)

Stand: 2026-09-17 · Parser alt `recht-nrw-parser/1.1.0`, aktuell `recht-nrw-parser/1.2.0`, Transformer `recht-nrw-transformer/2.1.0` · maschinenlesbar: `IMPORT_REGRESSION_FAELLE.json` · Legacy-Ausnahmen: `data/imports/recht-nrw/legacy-exceptions.json`

Sechs bereits übernommene Normen ergaben beim Regenerationslauf mit Parser 1.2.0 keinen Import mehr (`structure-unnumbered-section`, fail-closed: Sektion ohne Nummernfeld mit Normtext). Der Regressionsschutz hielt Manifest und Inhalt beim Stand 1.1.0. Analyse je Norm offline aus dem Cache (`.cache/recht-nrw/`), Dry-run ohne Schreibzugriff.

**Textintegrität**: sichtbarer Text der gespeicherten kanonischen Fassung (Kennzeichen, Titel, Text je Block, ohne Fußnotenblöcke, zeilenweise) gegen den transformierten Dry-run-Output des Parsers 1.2.0, SHA-256. Parser 1.1.0 führte Fußnoten des Vorspanns als Fließtextzeilen „Fn n: …“; diese Zeilen (zusätzlicher, kein fehlender Text) sind im Vergleich ausgenommen und je Fall ausgewiesen. Ergebnis: **alle sechs textidentisch**; der Unterschied ist ausschließlich strukturell.

**Entscheidung**: Fall A (Parser zu streng, Struktur sicher darstellbar) → Parserregel generalisiert, Regressionstest, Reimport. Fall B (fehlendes §-/Artikel-Kennzeichen in der Quelle; nicht sicher darstellbar, ohne ein Kennzeichen zu erfinden) → `needs-review` beim Reimport; gespeicherte Fassung nur mit dokumentierter Legacy-Ausnahme `deliver-legacy` (Textintegritätsnachweis, Quellhash, Parserstände, Freigabe) weiter ausgeliefert, sonst `depublish` (kontrollierte Entfernung). Kein Fall wird still schlechter: `import-regression` ohne Ausnahme bleibt ein Fehler und ein Readiness-Blocker.

| Term | Titel | Slug | Nummernlose Sektion(en) | Fehlendes Kennzeichen | Fall | Text alt/neu | Entscheidung |
| --- | --- | --- | --- | --- | --- | --- | --- |
| term:26534 | Gesetz zur Bereinigung des als Landesrecht fortgeltenden ehemaligen Re | gesetz-zur-bereinigung-des-als-landesrecht-fortgeltenden-ehemaligen-west | 7 | – (kein Kennzeichen fehlt) | A | identisch (1795 Zeichen) | Parserregel `editorial-notice-section` (Fixture `native-drupal/trailing-editorial-notice.html`); Reimport → importiert mit 1.2.0 |
| term:27211 | Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsra | aachen-gesetz-west | 34 | § 33 | B | identisch (56457 Zeichen) | Legacy-Ausnahme `legacy-27211` (deliver-legacy); Review-Fall unknown-structure bleibt offen |
| term:27217 | Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsra | duesseldorf-gesetz-west | 24 | § 23 | B | identisch (42108 Zeichen, 1 alte Fn-Zeile(n) ausgenommen) | Legacy-Ausnahme `legacy-27217` (deliver-legacy); Review-Fall unknown-structure bleibt offen |
| term:27514 | Gesetz zu dem Vertrag zwischen dem Land Nordrhein-Westfalen und dem He | gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-dem-heiligen-west | 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 | Articolo I–XI (italienischer Paralleltext) | B | identisch (22142 Zeichen) | Legacy-Ausnahme `legacy-27514` (deliver-legacy); Review-Fall unknown-structure bleibt offen |
| term:28146 | Verordnung über das Wahlverfahren zur Benennung der Beschäftigten des  | eig-wo-west | 14 | § 12a | B | identisch (12533 Zeichen, 3 alte Fn-Zeile(n) ausgenommen) | Legacy-Ausnahme `legacy-28146` (deliver-legacy); Review-Fall unknown-structure bleibt offen |
| term:29969 | Verordnung zur Umsetzung des Maßregelvollzugsgesetzes (VO MRVG) | vo-mrvg-west | 2 | § 1 | B | identisch (13305 Zeichen) | Legacy-Ausnahme `legacy-29969` (deliver-legacy); Review-Fall unknown-structure bleibt offen |

## Fälle

### term:26534 – Gesetz zur Bereinigung des als Landesrecht fortgeltenden ehemaligen Reichsrechts

- Quelle: <https://recht.nrw.de/lrgv/gesetz/10042014-gesetz-zur-bereinigung-des-als-landesrecht-fortgeltenden-ehemaligen> (native, sha256 bb295eda6eda47a13f81f387db4f28474138ab55b3c45c81c16a66560789fd97); Slug `gesetz-zur-bereinigung-des-als-landesrecht-fortgeltenden-ehemaligen-west`
- Alter Parserstand: recht-nrw-parser/1.1.0, imported-with-warnings, 5 Einheiten, bodyTextLength 1796
- Aktueller Parserbefund (1.2.0, Dry-run offline): dry-run; Fehler: –; Integrität fetch-parse ok, source-canonical ok; 5 Einheiten, bodyTextLength 1796
- Strukturelle Differenz: Sektion 7 (nach der letzten Einheit § 5) hat kein Nummernfeld und beginnt mit „Hinweis: Alle Gesetze und Verordnungen, die in der Anlage I zu § 1 … genannt werden, wurden … aufgehoben“, gefolgt von zwei Gliederungsnummern und der Schlussformel „Die Landesregierung“. Es ist der redaktionelle Hinweis des Portals zu den aufgehobenen Anlagen, kein Normtext einer fehlenden Einheit. Parser 1.1.0 hängte ihn still an § 5; Parser 1.2.0 meldete ihn als structure-unnumbered-section.
- Textintegrität: alt 1795 Zeichen (sha256 b50a1283d32d4823…) vs. neu 1795 Zeichen (sha256 b50a1283d32d4823…) → **identisch**
- Quellmarkup: Sektion 7: `<div class="paragraph-header article-header">` ohne `<h2><span class="field--field_num">`, Text `<p>Hinweis: Alle Gesetze und Verordnungen …</p>` … `<p class="text-align-center">Die Landesregierung<br>des Landes Nordrhein-Westfalen</p>`
- Beleg: Keine Zählungslücke (§ 1–§ 5 vollständig); Text beginnt mit „Hinweis:“; keine Nummernfeld-Sektion folgt.
- Entscheidung: **Fall A** – Parser 1.2.0 zu streng. Generalisierte Regel (native-parser): eine nummernlose Sektion nach der letzten Nummernfeld-Sektion, deren erste Zeile mit „Hinweis“ beginnt, ist ein redaktioneller Hinweis; die letzte Einheit wird geschlossen (`close-unit`), der Text steht auf Dokumentebene (Info `editorial-notice-section`). Kein Kennzeichen wird erfunden; derselbe Text zwischen zwei Einheiten bleibt `structure-unnumbered-section`. Regressionstest mit echtem Ausschnitt: `tests/fixtures/recht-nrw/native-drupal/trailing-editorial-notice.html`. Dry-run nach der Änderung: dry-run ohne Fehler, Text identisch → Reimport importiert die Norm mit Parser 1.2.0 (der Hinweis steht nun nach § 5 statt in § 5).

### term:27211 – Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsraumes Aachen (Aachen-Gesetz)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes> (native, sha256 2fe36069b4fe2bb88d1583de379a150cb75008d1b0ec44c8b0d6dcdc61d8e185); Slug `aachen-gesetz-west`
- Alter Parserstand: recht-nrw-parser/1.1.0, imported-with-warnings, 48 Einheiten, bodyTextLength 56458
- Aktueller Parserbefund (1.2.0, Dry-run offline): needs-review; Fehler: structure-unnumbered-section; Integrität fetch-parse ok, source-canonical ok; 48 Einheiten, bodyTextLength 56458
- Strukturelle Differenz: Sektion 34 (zwischen § 32 und § 34) hat kein Nummernfeld; Text „(1) In die Gemeinde Wegberg – mit Ausnahme der in § 32 genannten Flurstücke – werden die Gemeinden Arsbeck und Wildenrath eingegliedert. (2) …“. Nach Zählung und Querverweisen (§ 32: „in den §§ 31 und 33 genannten Flurstücke“; § 34: „in § 33 genannten Flurstücke“) ist das § 33. Parser 1.1.0 hängte Absätze (1)/(2) als weitere Absätze an § 32 (doppelte Absatzkennzeichen); Einheit § 33 fehlt.
- Textintegrität: alt 56457 Zeichen (sha256 4c610d8f7bd547ee…) vs. neu 56457 Zeichen (sha256 4c610d8f7bd547ee…) → **identisch**
- Quellmarkup: Sektion 34: `article-header` ohne `field--field_num`; Text `<p>(1) In die Gemeinde Wegberg …</p><p>(2) In die Gemeinde Wegberg werden weiter eingegliedert: …</p>`
- Beleg: Zählungslücke § 32 → § 34; Querverweise auf § 33 in § 32 und § 34.
- Entscheidung: **Fall B** – fehlendes Kennzeichen in der Quelle; ein Kennzeichen wird nicht erfunden (fail-closed). Legacy-Ausnahme `legacy-27211` (deliver-legacy, freigegeben 2026-09-17): Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256), alle 48 vorhandenen Einheiten korrekt; nur zwei Absätze stehen unter § 32 statt unter einem fehlenden § 33. Ein Kennzeichen wird nicht erfunden (fail-closed, Parser 1.2.0); Depublikation würde ein vollständiges Gebietsänderungsgesetz wegen einer Portallücke entziehen. Der Review-Fall unknown-structure bleibt offen. Folge: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: Feld unitLabel { section: 34, label: "§ 33" } mit Beleg Zählungslücke/Querverweise) und Reimport mit --only term:27211 --offline --write; danach Ausnahme entfernen.

### term:27217 – Gesetz zur Neugliederung der Gemeinden und Kreise des Neugliederungsraumes Mönchengladbach/Düsseldorf/Wuppertal (Düsseldorf-Gesetz)

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zur-neugliederung-der-gemeinden-und-kreise-des-neugliederungsraumes-4> (native, sha256 1e2fb5d237a83cb68b25c8db9bd58315571bf916803ef760d27fe32257e6ae22); Slug `duesseldorf-gesetz-west`
- Alter Parserstand: recht-nrw-parser/1.1.0, imported-with-warnings, 30 Einheiten, bodyTextLength 42223
- Aktueller Parserbefund (1.2.0, Dry-run offline): needs-review; Fehler: structure-unnumbered-section; Integrität fetch-parse ok, source-canonical ok; 30 Einheiten, bodyTextLength 42109
- Strukturelle Differenz: Sektion 24 (zwischen § 22 und § 24) hat kein Nummernfeld; Text „(1) Die Stadt Neuss wird in den Kreis Grevenbroich eingegliedert. (2) Der Kreis Grevenbroich erhält den Namen ‚Kreis Neuss‘. (3) Sitz der Kreisverwaltung ist die Stadt Neuss.“ Nach Zählung ist das § 23. Parser 1.1.0 hängte (1)–(3) an § 22; Einheit § 23 fehlt. Zusätzlich führt die gespeicherte Fassung eine Fußnote des Vorspanns als Fließtextzeile „Fn 1: …“ (Parser 1.1.0).
- Textintegrität: alt 42108 Zeichen (sha256 577bedb9b6f96298…) vs. neu 42108 Zeichen (sha256 577bedb9b6f96298…) → **identisch**; 1 Fußnoten-Fließtextzeile(n) „Fn n: …“ der alten Fassung ausgenommen (alt gesamt 42223 Zeichen)
- Quellmarkup: Sektion 24: `article-header` ohne `field--field_num`; Text `<p>(1) Die Stadt Neuss wird in den Kreis Grevenbroich eingegliedert.</p> …`
- Beleg: Zählungslücke § 22 → § 24.
- Entscheidung: **Fall B** – fehlendes Kennzeichen in der Quelle; ein Kennzeichen wird nicht erfunden (fail-closed). Legacy-Ausnahme `legacy-27217` (deliver-legacy, freigegeben 2026-09-17): Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256, ohne die alte Fußnoten-Fließtextzeile), 30 Einheiten korrekt; drei Absätze stehen unter § 22 statt unter einem fehlenden § 23. Kein Kennzeichen wird erfunden; Depublikation eines vollständigen Gebietsänderungsgesetzes wäre unverhältnismäßig. Review-Fall unknown-structure bleibt offen. Folge: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: unitLabel { section: 24, label: "§ 23" }, Beleg Zählungslücke) und Reimport mit --only term:27217 --offline --write; danach Ausnahme entfernen.

### term:27514 – Gesetz zu dem Vertrag zwischen dem Land Nordrhein-Westfalen und dem Heiligen Stuhl

- Quelle: <https://recht.nrw.de/lrgv/gesetz/01012000-gesetz-zu-dem-vertrag-zwischen-dem-land-nordrhein-westfalen-und-dem-heiligen> (native, sha256 286ecafc1125c54a8e9c946c01d6c68c07e567ac8444501e22c4e8f7250d56bf); Slug `gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-dem-heiligen-west`
- Alter Parserstand: recht-nrw-parser/1.1.0, imported-with-warnings, 13 Einheiten, bodyTextLength 22143
- Aktueller Parserbefund (1.2.0, Dry-run offline): needs-review; Fehler: structure-unnumbered-section; Integrität fetch-parse ok, source-canonical ok; 13 Einheiten, bodyTextLength 22143
- Strukturelle Differenz: Sektionen 15–25 (nach Artikel XI mit Schlussprotokoll) haben kein Nummernfeld; sie enthalten den italienischen Vertragstext (Articolo I–XI samt „PROTOCOLLO FINALE“), der laut Artikel XI „gleiche Kraft“ hat. Parser 1.1.0 hängte den gesamten italienischen Text als Absätze an Artikel XI; die deutschen Einheiten Artikel 1–2 (Zustimmungsgesetz) und I–XI (Vertrag) sind vollständig und korrekt.
- Textintegrität: alt 22142 Zeichen (sha256 a413267dc15b4651…) vs. neu 22142 Zeichen (sha256 a413267dc15b4651…) → **identisch**
- Quellmarkup: Sektion 15: `article-header` ohne `field--field_num`; Text `<p>L'impegno di coltivare e promuovere la Teologia cattolica …</p>`; Sektion 25 endet mit `PROTOCOLLO FINALE` und Unterschriften
- Beleg: Deutsche Artikel I–XI vollständig; 11 nummernlose Sektionen = 11 Articoli.
- Entscheidung: **Fall B** – fehlendes Kennzeichen in der Quelle; ein Kennzeichen wird nicht erfunden (fail-closed). Legacy-Ausnahme `legacy-27514` (deliver-legacy, freigegeben 2026-09-17): Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256); die normative deutsche Fassung ist korrekt strukturiert, nur der gleichrangige italienische Paralleltext steht ohne eigene Artikelkennzeichen am Ende von Artikel XI. Kennzeichen „Articolo I–XI“ werden nicht erfunden. Review-Fall unknown-structure bleibt offen. Folge: Redaktionelle Entscheidung, ob der italienische Paralleltext als eigener Anlage-Container (z. B. Override unitLabel je Sektion 15–25 oder Container-Override „Testo italiano“) geführt wird; bis dahin Ausnahme. Reimport mit --only term:27514 --offline --write.

### term:28146 – Verordnung über das Wahlverfahren zur Benennung der Beschäftigten des Eigenbetriebs für die Wahl in den Betriebsausschuss (Wahlordnung für Eigenbetriebe - Eig-WO)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/30082012-verordnung-ueber-das-wahlverfahren-zur-benennung-der-beschaeftigten> (native, sha256 9aaa1928cf517053b8a8229d3220d80cec37e794247d7d069992a6ccad0025ac); Slug `eig-wo-west`
- Alter Parserstand: recht-nrw-parser/1.1.0, imported-with-warnings, 13 Einheiten, bodyTextLength 12848
- Aktueller Parserbefund (1.2.0, Dry-run offline): needs-review; Fehler: structure-unnumbered-section; Integrität fetch-parse ok, source-canonical ok; 13 Einheiten, bodyTextLength 12534
- Strukturelle Differenz: Sektion 14 (zwischen § 12 „Anfechtung der Wahl“ und § 13 „Inkrafttreten“) hat kein Nummernfeld, trägt aber die Fußnote „§ 12 a eingefügt durch Artikel 3 der VO vom 13. August 2012“; Text „Für die Berechnung der in dieser Verordnung festgelegten Fristen finden die §§ 186 bis 193 des Bürgerlichen Gesetzbuchs entsprechende Anwendung.“ Das ist § 12a. Parser 1.1.0 hängte den Satz an § 12; Einheit § 12a fehlt. Zusätzlich drei Fußnoten des Vorspanns als Fließtextzeilen „Fn 1–3: …“.
- Textintegrität: alt 12533 Zeichen (sha256 2a256234d807169f…) vs. neu 12533 Zeichen (sha256 2a256234d807169f…) → **identisch**; 3 Fußnoten-Fließtextzeile(n) „Fn n: …“ der alten Fassung ausgenommen (alt gesamt 12848 Zeichen)
- Quellmarkup: Sektion 14: `article-header` ohne `field--field_num`, `footnote-item` „§ 12 a eingefügt durch Artikel 3 der VO vom 13. August 2012 (GV. NRW. S. 296) …“, Text `<p>Für die Berechnung der in dieser Verordnung festgelegten Fristen …</p>`
- Beleg: Fußnote der Sektion nennt „§ 12 a eingefügt“; Position zwischen § 12 und § 13.
- Entscheidung: **Fall B** – fehlendes Kennzeichen in der Quelle; ein Kennzeichen wird nicht erfunden (fail-closed). Legacy-Ausnahme `legacy-28146` (deliver-legacy, freigegeben 2026-09-17): Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256, ohne die alten Fußnoten-Fließtextzeilen), 13 Einheiten korrekt; ein Satz steht unter § 12 statt unter einem fehlenden § 12a. Kennzeichen wird nicht aus der Fußnote erfunden (fail-closed). Review-Fall unknown-structure bleibt offen. Folge: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: unitLabel { section: 14, label: "§ 12a" }, Beleg: Fußnote der Sektion „§ 12 a eingefügt …“) und Reimport mit --only term:28146 --offline --write; danach Ausnahme entfernen.

### term:29969 – Verordnung zur Umsetzung des Maßregelvollzugsgesetzes (VO MRVG)

- Quelle: <https://recht.nrw.de/lrgv/rechtsverordnung/01012021-verordnung-zur-umsetzung-des-massregelvollzugsgesetzes-vo-mrvg> (native, sha256 32e8c1ac987d5482a5453f7045b0251d106362059e8a70b51bfab27ea5ba967a); Slug `vo-mrvg-west`
- Alter Parserstand: recht-nrw-parser/1.1.0, imported-with-warnings, 16 Einheiten, bodyTextLength 13306
- Aktueller Parserbefund (1.2.0, Dry-run offline): needs-review; Fehler: structure-unnumbered-section; Integrität fetch-parse ok, source-canonical ok; 16 Einheiten, bodyTextLength 13306
- Strukturelle Differenz: Sektion 2 (nach dem Vorspann mit Ausfertigung, Ermächtigung und Gliederung „Teil 1 Regelung von Zuständigkeiten“, vor § 2 „Aufsicht“) hat kein Nummernfeld; Text „Die Auswahl Dritter nach § 29 Absatz 2 Satz 1 Maßregelvollzugsgesetz, die Festlegung von Standards im Maßregelvollzug und die Standortentscheidungen trifft das für das Gesundheitswesen zuständige Ministerium.“ Nach Zählung ist das § 1. Parser 1.1.0 führte den Satz als Absatz unter Teil 1 vor § 2; Einheit § 1 fehlt.
- Textintegrität: alt 13305 Zeichen (sha256 9d33f834267bfeb4…) vs. neu 13305 Zeichen (sha256 9d33f834267bfeb4…) → **identisch**
- Quellmarkup: Sektion 1 endet mit `<p class="text-align-center"><strong>Teil 1<br>Regelung von Zuständigkeiten</strong></p>`; Sektion 2: `article-header` ohne `field--field_num`, Text `<p>Die Auswahl Dritter nach § 29 Absatz 2 Satz 1 …</p>`
- Beleg: Zählung beginnt bei § 2; Sektion steht unmittelbar nach der Gliederungsüberschrift Teil 1.
- Entscheidung: **Fall B** – fehlendes Kennzeichen in der Quelle; ein Kennzeichen wird nicht erfunden (fail-closed). Legacy-Ausnahme `legacy-29969` (deliver-legacy, freigegeben 2026-09-17): Legacy-safe: Text vollständig und mit dem aktuellen Parseroutput identisch (SHA-256), 16 Einheiten korrekt; ein Satz steht als Absatz unter Teil 1 statt unter einem fehlenden § 1 – keiner anderen Einheit zugeschlagen. Kennzeichen wird nicht erfunden. Review-Fall unknown-structure bleibt offen. Folge: Dokumentiertes Override des fehlenden Kennzeichens (Vorschlag: unitLabel { section: 2, label: "§ 1" }, Beleg Zählungsbeginn bei § 2) und Reimport mit --only term:29969 --offline --write; danach Ausnahme entfernen.

## Zielzustand und Befehle

1. `npm run import:recht-nrw:bulk -- --area lrgv --only term:26534 --offline --write --resume` → imported (Parser 1.2.0).
2. `npm run import:recht-nrw:bulk -- --area lrgv --only term:27211,term:27217,term:27514,term:28146,term:29969 --offline --write --resume` → je needs-review mit Warnung `import-regression-legacy`; Manifest/Inhalt bleiben (1.1.0), Review-Fall `other` (import-regression) wird abgelöst, `unknown-structure` bleibt offen.
3. `npm run import:recht-nrw:bulk -- --area lrgv --regenerate-stale --offline --write --resume` erfasst dieselben Einträge (und alle weiteren veralteten Status done/review/failed/excluded).
4. `node scripts/import-recht-nrw.ts audit` zeigt den Versionsreport: 5 begründete Altstände (Hinweis), 0 unbegründete (Blocker).

Depublikation statt Weiterlieferung: `disposition` in `legacy-exceptions.json` auf `depublish` setzen und denselben `--only`-Befehl ausführen (Inhalt und Report werden entfernt, Manifest `needs-review` mit Parser 1.2.0, Slug bleibt reserviert).

