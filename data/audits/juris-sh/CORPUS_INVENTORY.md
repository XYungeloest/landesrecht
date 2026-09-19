# Vollkorpus-Inventur juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts inventory --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Netzfrei aus dem Cache von `fetch-corpus` (öffentliche PDF-Ausgabe). Je Dokument der Vollweg der Stichprobe: Parser → SH-Modell → Stichtag (bei späteren Änderungen die am Stichtag geltenden Einzelfassungen) → Überleitung SH → NSH → `validateNormRecord` → Textintegrität, dazu Stichtagsbelege mit dem bestehenden Ereignisregister (Regeln A/B/C). Parser `juris-sh-parser/1.0.0`, Überleitung `juris-sh-transformer/1.1.0`.

## 1 Ausgänge

| Kennzahl | Wert |
| --- | --- |
| Enumeriert | 5197 |
| Verarbeitet | 5197 |
| Ausgänge | import-ready 2383 · not-at-baseline 1643 · review 586 · part-of-main 523 · reconstruction 56 · failed 4 · not-cached 2 |
| Landesrecht | import-ready 1340 · not-at-baseline 1115 · review 307 · reconstruction 44 · not-cached 2 |
| Verwaltungsvorschriften | import-ready 1043 · not-at-baseline 528 · part-of-main 523 · review 279 · reconstruction 12 · failed 4 |
| Manifeststatus | imported-with-warnings 1867 · not-at-baseline 1643 · needs-review 642 · excluded 523 · imported 516 · failed 4 |
| Stichtagseinordnung der Ausgabe | unchanged-since-baseline 3049 · repealed-before-baseline 962 · enacted-after-baseline 761 · changed-after-baseline 262 · repealed-after-baseline 88 · undetermined 73 |
| Stichtagsregel (A/B/C) | B-strong-begin-and-continuity 3433 · A-strong-end-before-baseline 962 · C-undetermined 796 |
| Textintegrität | exact 3118 · explained-difference 2075 · review 1 · mismatch 1 |
| Normtyp | verwaltungsvorschrift 2389 · verordnung 2025 · gesetz 728 · zustimmungsgesetz 51 · verfassung 2 |

## 2 Sperrgründe (Dokumente je Grund)

| Grund | Dokumente |
| --- | --- |
| `parse:table-layout` | 245 |
| `parse:incomplete-source-text` | 86 |
| `transform:undecidable-source-state-abbreviation` | 76 |
| `parse-units:table-layout` | 63 |
| `parse:annex-separate-document` | 46 |
| `historical:unit-selection` | 44 |
| `parse:vwv-annex-document` | 38 |
| `transform:organ-formula-conflict` | 30 |
| `transform:residual-source-state-reference` | 27 |
| `parse:body-unit-not-in-toc` | 18 |
| `parse:toc-unit-missing` | 16 |
| `parse:figure` | 12 |
| `units-missing:changed-after-baseline` | 12 |
| `parse-units:incomplete-source-text` | 8 |
| `baseline:ledger-contradiction` | 7 |
| `baseline:undetermined` | 4 |
| `schema:title-missing` | 4 |
| `parse:empty-footnote` | 3 |
| `parse-units:figure` | 2 |
| `integrity:review` | 1 |
| `integrity:mismatch` | 1 |

`parse:table-layout` und `pdf-only`-Abbildungen gehen in den Review, weil der Textlayer Tabellen- und Bildinhalte nicht sicher trägt; `units-missing` heißt: Am Stichtag galt eine andere Fassung, die Einzelfassungen sind noch nicht (vollständig) im Cache (`npm run import:juris-sh:fetch-corpus -- --phase units`); `baseline:ledger-contradiction`: Das Ereignisregister belegt eine Änderung nach dem Stichtag, die Ausgabe nicht.

## 3 Zweite Quelle: amtliche Register

| Register | Bereich | Stand | Registerköpfe (nach Ausschluss) | ausgenommen | nur Gliederungsnummer | streng (Kennung oder Titel mit Datum) | je Stufe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gvobl-systematische-uebersicht | landesrecht | 2024-12-13 | 1727 | 61 | 1521 = 88.1 % | 1546 = 89.5 % | gl 1521 · gl-variant 1 · fundstelle 20 · title-date 4 · title-only 20 · none 161 |
| ab-erlassverzeichnis | vwv | 2024-09-30 | 817 | 29 | 655 = 80.2 % | 655 = 80.2 % | gl 655 · gl-amendment-only 29 · title-only 44 · none 89 |

Zählbasis sind die Köpfe des vollen amtlichen Registers (Audit „NSH-Audit“, `audit/register-crosscheck.ts`), nicht Änderungsereignisse. Ein bloßer Titeltreffer zählt nie als gefunden (Handprüfung: 37 % bzw. 81 % Falschtreffer). Die Quote ist ein Indikator, kein Gate; jeder nicht gefundene Kopf ist klassifiziert und steht in der Rekonstruktionsqueue.

**gvobl-systematische-uebersicht: nicht streng gefunden (181)**

| Gl.Nr. | Titel laut Register | Stufe | Einordnung |
| --- | --- | --- | --- |
| 188-2-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages | title-only | nur-titelaehnlichkeit-ungeprueft |
| 188-3 | Gesetz zur Umsetzung des Verfassungsschutzauftrages zur Stärkung der nationalen Minderheiten und Volksgruppen | none | nicht-in-juris |
| 20-17 | Gesetz zur Ermöglichung des Bodycam-Einsatzes nach § 184a LVwG in Wohnungen | none | nicht-in-juris |
| 200-0-408 | Landesverordnung zur Übertragung von Zuständigkeiten in den Bereichen des Pflanzenschutzes, der Pflanzengesundheit und d | title-only | nur-titelaehnlichkeit-ungeprueft |
| 200-13 | Gesetz zum Staatsvertrag zwischen den Ländern Mecklenburg-Vorpommern und Schleswig-Holstein, der Freien und Hansestadt H | none | nicht-in-juris |
| 200-14 | Gesetz zu dem Ersten Staatsvertrag zur Änderung des Staatsvertrages über die Errichtung der Eichdirektion Nord (1. Änder | none | nicht-in-juris |
| 200-14-1 | Bekanntmachung über das Inkrafttreten des Ersten Staatsvertrages zur Änderung des Staatsvertrages über die Erricthung de | none | nicht-in-juris |
| 200-16 | Gesetz zum Staatsvertrag zwischen dem Land Schleswig-Holstein, der Freien und Hansestadt Hamburg, dem Land Mecklenburg-V | none | nicht-in-juris |
| 200-16-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen dem Land Schleswig-Holstein, der Freien und Hansestad | none | nicht-in-juris |
| 200-18 | Gesetz zum Staatsvertrag zwischen dem Land Schleswig-Holstein, der Freien und Hansestadt Hamburg, dem Land Mecklenburg-V | none | nicht-in-juris |
| 200-18-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen dem Land Schleswig-Holstein, der Freien und Hansestad | none | nicht-in-juris |
| 200-20-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über datenschutzrechtliche Anpassungen am „Dataport-Staatsvert | none | nicht-in-juris |
| 2012-12-1 | Bekanntmachung über das Inkrafttreten des Abkommens zwischen den Ländern Freie Hansestadt Bremen, Freie und Hansestadt H | none | nicht-in-juris |
| 2012-14 | Gesetz zum Abkommen zur Änderung des Abkommens über die einheitliche Ausbildung der Anwärter für den höheren Polizeivoll | none | nicht-in-juris |
| 2012-14-1 | Bekanntmachung über das Inkrafttreten des Abkommens zur Änderung des Abkommens über die einheitliche Ausbildung der Anwä | none | nicht-in-juris |
| 2012-15-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen den Ländern Baden-Württemberg, Bayern, Hessen und Nor | none | nicht-in-juris |
| 2012-16-1 | Bekanntmachung über das Inkrafttreten der Abkommen zwischen den Ländern Niedersachsen, Schleswig-Holstein und Hamburg üb | none | nicht-in-juris |
| 2012-17-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Errichtung und den Betrieb eines Rechen- und Dienstle | none | nicht-in-juris |
| 2020-32 | Gesetz zur Schaffung eines Prüfungsrechtes des Landesrechnungshofes im Rahmen der Eingliederungshilfe | none | nicht-in-juris |
| 2032-17-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Verteilung von Versorgungslasten bei bund- und länder | none | nicht-in-juris |
| 2032-23 | Gesetz zur Förderung der personalwirtschaftlichen Bewältigung besonderer Bedarfslagen | none | nicht-in-juris |
| 2033-4 | Gesetz zur Regelung der Aufhebung von durch das Landesmindestlohngesetz bedingten Nebenbestimmungen in bestandskräftigen | title-only | nur-titelaehnlichkeit-ungeprueft |
| 205-3-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 206-5 | Gesetz zum Zweiten Staatsvertrag zur Änderung des IT-Staatsvertrags | none | nicht-in-juris |
| 212-3-1 | Bekanntmachung über das Inkrafttreten des Abkommens zwischen den Ländern Brandenburg, Freie Hansestadt Bremen, Freie und | none | nicht-in-juris |
| 2120-10-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Zusammenarbeit auf verschiedenen Gebieten des Gesundheitswe | none | nicht-in-juris |
| 2120-12-1 | Bekanntmachung über das Inkrafttreten des Abkommens zur Änderung des Abkommens über die Zusammenarbeit auf verschiedenen | none | nicht-in-juris |
| 2120-24-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Errichtung und den Betrieb des elektronischen Gesundh | none | nicht-in-juris |
| 2120-8-2 | Bekanntmachung über das Inkrafttreten der Änderung des § 8 des Rettungsdienstgesetzes (Art. 2 Abs. 4 Ges. v. 6.11.2001) | none | nicht-in-juris |
| 2121-3-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Zentralstelle der Länder für Gesundheitsschutz bei Arzneimi | none | nicht-in-juris |
| 2121-4-1 | Bekanntmachung über das Inkrafttreten des Abkommens zur Änderung des Abkommens über die Zentralstelle der Länder für Ges | none | nicht-in-juris |
| 2121-5-1 | Bekanntmachung über das In-Kraft-Treten des Zweiten Abkommens zur Änderung des Abkommens über die Zentralstelle der Länd | none | nicht-in-juris |
| 2127-2-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Errichtung und Finanzierung der Akademie für öffentliches G | none | nicht-in-juris |
| 2127-3-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische  | none | nicht-in-juris |
| 2127-7-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Errichtung und Finanzierung des Instituts für medizinische  | none | nicht-in-juris |
| 2129-43-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen Baden-Württemberg, Bayern, Berlin, Brandenburg, Breme | none | nicht-in-juris |
| 2130-13-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Schaffung der planerischen Voraussetzungen für die Er | none | nicht-in-juris |
| 2130-15-1 | Bekanntmachung über das Inkrafttreten des Gesetzs zur Änderung Marktüberwachungsverordnungs-Durchführungsgesetzes | none | nicht-in-juris |
| 2130-16-1 | Bekanntmachung über das Inkrafttreten des Abkommens zur zweiten Änderung des Abkommens über das Deutsche Institut für Ba | none | nicht-in-juris |
| 2130-18-1 | Bekanntmachung über das Inkrafttreten des Abkommens zur dritten Änderung des Abkmmens über das Deuitsche Institut für Ba | none | nicht-in-juris |
| 215-4-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Flutung der Havelpolder und die Einrichtung einer gem | none | nicht-in-juris |
| 2183-1 | Gesetz über die durch innere Unruhen verursachten Schäden | none | nicht-in-juris |
| 2183-1-1 | Verordnung zur Ausführung des Gesetzes über die durch innere Unruhen verursachten Schäden vom 12. Mai 1920 (RGBl. S. 941 | none | nicht-in-juris |
| 2186-21 | Gesetz zur institutionellen Förderung des Landesfeuerwehrverbandes | none | nicht-in-juris |
| 2186-23-1 | Bekanntmachung über das Inkrafttreten des Dritten Staatsvertrages zur Änderung des Staatsvertrages zum Glücksspielwesen  | none | nicht-in-juris |
| 2186-24-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Neuregulierung des Glücksspielwesens in Deutschland (Glück | none | nicht-in-juris |
| 2186-28-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Änderung des Glücksspielstaatsvertrags 2021 | none | nicht-in-juris |
| 221-19 | Gesetz zur Errichtung des Universitätsklinikums Schleswig-Holsteim | none | nicht-in-juris |
| 221-26-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrags über die Errichtung einer gemeinsamen Einrichtung für Hochschul | none | nicht-in-juris |
| 221-33 | Gesetz über die Stiftungsuniversität zu Lübeck (SiftULG) und zur Änderung hochschulrechtlicher Vorschriften | none | nicht-in-juris |
| 2221-2-1 | Bekanntmachung über das Inkrafttreten des Vertrages zwischen dem Land Schleswig-Holstein und den evangelischen Landeskir | none | nicht-in-juris |
| 2222-5-1 | Bekanntmachung über das Inkrafttreten des Vertrages über die Errichtung von Erzbistum und Kirchenprovinz Hamburg | none | nicht-in-juris |
| 2222-6-1 | Bekanntmachung über das Inkrafttreten des am 12. Januar 2009 geschlossenen Vertrages zwischen dem Land Schleswig-Holstei | none | nicht-in-juris |
| 223-10-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über das Fernunterrichtswesen | none | nicht-in-juris |
| 223-12-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Änderung des Staatsvertrages über das Fernunterrichts | none | nicht-in-juris |
| 224-1-39 | Landesverordnung über den Denkmalbereich „Fischersiedlung Holm in Denkmal- Schleswig“ pflege Vom 23.11.2018, GVOBl. 2019 | none | nicht-in-juris |
| 224-3-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die gemeinsame Finanzierung der Stiftung „Preußischer Kulturbes | none | nicht-in-juris |
| 2251-33 | Gesetz zum Staatsvertrag zur Änderung des Staatsvertrages über den Norddeutschen Rundfunk (NDR) | none | nicht-in-juris |
| 2251-34 | Gesetz zum Staatsvertrag zur Änderung des Staatsvertrages über den Norddeutschen Rundfunk (NDR) | none | nicht-in-juris |
| 2251-36 | Gesetz zum Neunten Rundfunkänderungsstaatsvertrag | none | nicht-in-juris |
| 2251-37 | Gesetz zum Zehnten Rundfunkänderungsstaatsvertrag | none | nicht-in-juris |
| 2251-38 | Gesetz zum Elften Rundfunkänderungsstaatsvertrag | none | nicht-in-juris |
| 2251-40 | Gesetz zum Dreizehnten Rundfunkänderungsstaatsvertrag | none | nicht-in-juris |
| 2251-47 | Gesetz zum Neuntenzehnten Rundfunkänderungsstaatsvertrag | none | nicht-in-juris |
| 2251-48 | Gesetz zum Zwanzigsten Staatsvertrag zur Änderung rundfunkrechtlicher Staatsverträge (Zwanszigster Rundfunkänderungsstaa | none | nicht-in-juris |
| 2253-3-1 | Bekanntmachung über das Inkrafttreten des Vertrages zum Europäischen Fernsehkulturkanal (EKK) | none | nicht-in-juris |
| 2253-4-1 | Bekanntmachung über das Inkrafttreten des Europäischen Übereinkommens über das grenzüberschreitende Fernsehen | none | nicht-in-juris |
| 2254-1-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages der Länder Berlin, Niedersachsen und Schleswig-Holstein über d | none | nicht-in-juris |
| 2254-10 | Gesetz zum Vierten Medienänderungsstaatsvertrag | none | nicht-in-juris |
| 2254-11 | Gesetz zum Fünften Medienänderungsstaatsvertrag | none | nicht-in-juris |
| 2254-12 | Gesetz zum Sechsten Medienänderungsstaatsvertrag | none | nicht-in-juris |
| 2254-16 | Gesetz Zum Achten Staatsvertrag zur Änderung medienrechtlicher Vorschriften in Hamburg und Schleswig-Holstein (Achter Me | none | nicht-in-juris |
| 2254-16-1 | Bekanntmachung über das Inkrafttreten des Achten Staatsvertrages zur Änderung medienrechtlicher Vorschriften in Hamburg  | none | nicht-in-juris |
| 2254-17 | Gesetz zum Zweiten Staatsvertrag zur Änderung medienrechtlicher Staatsverträge (Zweiter Medienänderungsstaatsvertrag) | none | nicht-in-juris |
| 2254-18-1 | Bekanntmachung über das Inkrafttreten des Neunten Staatsvertrages zur Änderung medienrechtlicher Vorschriften in Hamburg | none | nicht-in-juris |
| 2254-19-1 | Bekanntmachung über das Inkrafttreten des Dritten Staatsvertrages zur Änderung medienrechtlicher Staatsverträge (Dritter | none | nicht-in-juris |
| 2254-20-1 | Bekanntmachung über das Inkrafttreten des Vierten Staatsvertrages zur Änderung medienrechtlicher Staatsverträge (Vierter | none | nicht-in-juris |
| 2254-21 | Gesetz zum Fünften Staatsvertrag zur Änderung medienrechtlicher Staatsverträge | none | nicht-in-juris |
| 2254-21-1 | Bekanntmachung über das Inkrafttreten des Fünften Staatsvertrages zur Änderung medienrechtlicher Staatsverträge (Fünfter | none | nicht-in-juris |
| 2254-7 | Gesetz zum Ersten Staatsvertrag zur Änderung des Staatsvertrages über das Medienrecht in Hamburg und Schleswig-Holstein  | none | nicht-in-juris |
| 2254-8 | Gesetz zum Zweiten Staatsvertrag zur Änderung des Staatsvertrages über das Medienrecht in Hamburg und Schleswig-Holstein | none | nicht-in-juris |
| 2254-9 | Gesetz zum Dritten Staatsvertrag zur Änderung des Staatsvertrages über das Medienrecht in Hamburg und Schleswig-Holstein | none | nicht-in-juris |
| 26-1-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die erweiterte Zuständigkeit der mit der Begleitung aufen | none | nicht-in-juris |
| 300-12-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Verteilungsverfahren | none | nicht-in-juris |
| 300-13-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die technische Schutzrechte | none | nicht-in-juris |
| 300-19 | Landesjustizgesetz (LJG) Art. 1 Ges. vom 17.4.2018, GVOBl. S. 231, Anlage 1 ber. S. 441 • geänd. (Art. 1 Ges. v. 17.3.20 | title-only | nur-titelaehnlichkeit-ungeprueft |
| 300-9-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien Hansestadt Bremen, der Freien und Hansesta | none | nicht-in-juris |
| 301-10-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Änderung der Übereinkunft der Länder Freie Hansestadt Brem | none | nicht-in-juris |
| 301-10-2 | Bekanntmachung der Neufassung der Übereinkunft der Länder Freie Hansestadt Bremen, Freie und Hansestadt Hamburg und Schl | none | nicht-in-juris |
| 301-11-3 | Bekanntmachung über das Inkrafttreten von Artikel 1 Nr. 1 Buchst. c der Landesverordnung zur Änderung der Juristenausbil | none | nicht-in-juris |
| 301-12-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Änderung der Übereinkunft der Länder Freie Hansestadt Brem | none | nicht-in-juris |
| 301-13-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Änderung der Übereinkunft der Länder Freie Hansestadt Brem | none | nicht-in-juris |
| 302-2-1 | Bekanntmachung über das In-Kraft-Treten des Staatsvertrages zwischen den Ländern Niedersachsen und Schleswig-Holstein üb | none | nicht-in-juris |
| 302-3-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Einrichtung eines gemeinsamen Studienganges für den A | none | nicht-in-juris |
| 312-14-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages vom 15. Januar 2010 zwischen dem Land Schleswig-Holstein und d | none | nicht-in-juris |
| 312-15-1 | Bekanntmachung über das Inkrafttreten des Abkommens vom 11. Dezember 2009 zwischen dem Land Schleswig-Holstein und der F | none | nicht-in-juris |
| 312-6-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die | title-only | nur-titelaehnlichkeit-ungeprueft |
| 315-6-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages vom 4. Juli 2013 über die Übertragung von Aufgaben nach §§ 802 | none | nicht-in-juris |
| 350-3-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen den Ländern Freie und Hansestadt Hamburg, Niedersachs | none | nicht-in-juris |
| 350-4-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrags vom 10. März 2014 zwischen der Freien und Hansestadt Hamburg un | none | nicht-in-juris |
| 404-2-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Gemeinsame Zentrale Adoptionsstelle | none | nicht-in-juris |
| 450-6-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen dem Land Schleswig-Holstein und der Freien und Hanses | none | nicht-in-juris |
| 702-2-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Durchführung der Wirtschaftsprüferordnung in den Ländern Br | none | nicht-in-juris |
| 707-10-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages vom 19. Januar 2012 zwischen der Freien und Hansestadt Hamburg | none | nicht-in-juris |
| 707-11 | Gesetz zum Staatsvertrag zwischen der Freien und Hansestadt Hamburg, dem Land Mecklenburg-Vorpommern, dem Land Niedersac | none | nicht-in-juris |
| 707-11-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages vom 29.9.2016 zwischen der Freien und Hansestadt Hamburg, dem  | none | nicht-in-juris |
| 7121-1-1 | Bekanntmachung über das Inkrafttreten des Gesetzes zur Änderung des Ingenieurgesetzes | none | nicht-in-juris |
| 7141-1-1 | Bekanntmachung über das Inkrafttreten des Abkommens über einheitliche Ausbildung und Prüfung im Bereich des gesetzlichen | none | nicht-in-juris |
| 7401-1-0 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 7401-1-2 | Bekanntmachung über das Inkrafttreten des Abkommens zwischen der Freien und Hansestadt Hamburg und dem Land Schleswig-Ho | none | nicht-in-juris |
| 751-2-1 | Bekanntmachung über das Inkrafttreten des Abkommens zwischen der Bundesrepublik Deutschland, der Freien und Hansestadt H | none | nicht-in-juris |
| 753-2-104 | Landesverordnung über die Festsetzung eines Wasserschutzgebietes für die Wassergewinnungsanlagen des Wasserverbandes Süd | none | nicht-in-juris |
| 762-10 | Gesetz zum Staatsvertrag zwischen der Freien und Hansestadt Hamburg und dem Land Schleswig-Holstein zur Änderung des Sta | none | nicht-in-juris |
| 762-10-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 762-4 | Gesetz zur Neustrukturierung der Landesbank Schleswig-Holstein Girozentrale, zur Verselbständigung der Investitionsbank  | none | nicht-in-juris |
| 762-6-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 762-7-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 762-8 | Gesetz zum Staatsvertrag zwischen der Freien und Hansestadt Hamburg und dem Land Schleswig-Holstein zur Änderung des Sta | none | nicht-in-juris |
| 762-8-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 762-9-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| 7814-2-1 | Ausführungsanweisung II zu den Siedlungsgesetzen | none | nicht-in-juris |
| 7814-2-2 | Ausführungsanweisung III zu den Siedlungsgesetzen | none | nicht-in-juris |
| 7814-2-3 | Ausführungsanweisung IV zu den Siedlungsgesetzen | none | nicht-in-juris |
| 7814-2-4 | Ausführungsanweisung V zu den Siedlungsgesetzen | none | nicht-in-juris |
| 7814-2-5 | Ausführungsanweisung VI zu den Siedlungsgesetzen | none | nicht-in-juris |
| 7816-2 | Gesetz über die Ablösung der Servituten, die Teilung der Gemeinheiten und die Zusammenlegung der Grundstücke für die Pro | none | nicht-in-juris |
| 7816-3 | Gesetz über das Verfahren in Auseinandersetzungsangelegenheiten | none | nicht-in-juris |
| 7847-3-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen dem Land Schleswig-Holstein und der Freien und Hanses | none | nicht-in-juris |
| 790-7-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen den Ländern Hessen, Niedersachsen, Sachsen-Anhalt und | none | nicht-in-juris |
| 791-0-2 | Verordnung über das Naturschutzgebiet Hamburger Hallig, Kreis Nordfriesland | none | nicht-in-juris |
| 791-0-3 | Verordnung über das Naturschutzgebiet „Tetenhusener Moor“, Kreis Schleswig | none | nicht-in-juris |
| 791-0-4 | Verordnung über das „Naturschutzgebiet Kampener Vogelkoje auf Sylt“ | none | nicht-in-juris |
| 791-3-10 | Verordnung über das „Naturschutzgebiet Reher Kratt“ in der Gemarkung Reher, Kreis Steinburg | none | nicht-in-juris |
| 791-3-13 | Verordnung über das „Naturschutzgebiet Lütjenholmer Heidedünen“ in der Gemarkung Lütjenholm, Kreis Nordfriesland | none | nicht-in-juris |
| 791-3-14 | Verordnung über das „Naturschutzgebiet Heidefläche bei Kellinghusen“ in der Gemarkung Vorbrügge, Kreis Steinburg | none | nicht-in-juris |
| 791-3-16 | Verordnung zum Schutze von Landschaftsteilen in den Gemeinden Osterrade und Offenbüttel im Kreise Dithmarschen und der G | none | nicht-in-juris |
| 791-3-17 | Verordnung über das „Naturschutzgebiet Vogelfreistätte Lebrader Teich“ in der Gemeinde Lebrade, Kreis Plön | none | nicht-in-juris |
| 791-3-18 | Verordnung über das „Naturschutzgebiet Düne am Rimmelsberg“ in der Gemeinde Jörl, Kreis Flensburg-Land | none | nicht-in-juris |
| 791-3-20 | Verordnung über das „Naturschutzgebiet Süderlügumer Binnendünen“ in der Gemarkung Süderlügum, Kreis Nordfriesland | none | nicht-in-juris |
| 791-3-23 | Verordnung über das „Naturschutzgebiet Pobüller Bauernholz“ in den Gemeindebezirken Sollwitt im Kreise Nordfriesland und | none | nicht-in-juris |
| 791-3-24 | Verordnung über das „Naturschutzgebiet Süderberge“ in der Gemarkung Süderlügum, Kreis Nordfriesland | none | nicht-in-juris |
| 791-3-26 | Verordnung über das „Naturschutzgebiet Löwenstedter Sandberge“ in der Gemarkung Löwenstedt, Kreis Nordfriesland | none | nicht-in-juris |
| 791-3-28 | Verordnung über das „Naturschutzgebiet Hechtmoor“ in der Gemarkung Dammholm, Kreis Schleswig | none | nicht-in-juris |
| 791-3-29 | Verordnung über das „Naturschutzgebiet Gr. Wittenseer Moor“ in der Gemarkung Gr. Wittensee, Kreis Rendsburg-Eckernförde | none | nicht-in-juris |
| 791-3-3 | Verordnung über das Naturschutzgebiet Nordspitze Amrum auf der Insel Amrum im Kreise Nordfriesland | none | nicht-in-juris |
| 791-3-30 | Verordnung über das „Naturschutzgebiet Kaltenhofener Moor“ in den Gemarkungen Kaltenhof und Birkenmoor der Gemeinden Fel | none | nicht-in-juris |
| 791-3-31 | Verordnung über das „Naturschutzgebiet Weißenhäuser Brök“ in der Gemarkung Weißenhaus, Kreis Ostholstein | none | nicht-in-juris |
| 791-3-32 | Verordnung über das „Naturschutzgebiet Halloher Moor, Brandsheide und Könster Moor“ in der Gemarkung Großenaspe, Kreis S | none | nicht-in-juris |
| 791-3-4 | Verordnung über das Naturschutzgebiet „Sorgwohld“ bei Sorgwohld, Kreis Rendsburg-Eckernförde | none | nicht-in-juris |
| 791-4-233 | Landesverordnung über das Naturschutzgebiet „Goldenseeufer, Heidberg und Umgebung“ | none | nicht-in-juris |
| 8053-1-1 | Bekanntmachung über das Inkrafttreten des Abkommens über die Zentralstelle der Länder für Sicherheitstechnik und über di | none | nicht-in-juris |
| 8053-2-1 | Bekanntmachung über das In-Kraft-Treten des Abkommens zur Änderung des Abkommens über die Zentralstelle der Länder für S | none | nicht-in-juris |
| 8053-3-1 | Bekanntmachung über das In-Kraft-Treten des Abkommens zur Änderung des Abkommens über die Zentralstelle der Länder für S | none | nicht-in-juris |
| 8053-8-1 | Bekanntmachung über das In-Kraft-Treten des Abkommens zur Änderung des Abkommens über die Zentralstelle der Länder für S | none | nicht-in-juris |
| 8053-9 | Gesetz zu dem Abkommen zur Änderung des Abkommens über die Zentralstelle der Länder für Sicherheitstechnik (ZLS) | none | nicht-in-juris |
| 8053-9-1 | Bekanntmachung über das Inkrafttreten der Änderung des Abkommens über die Zentralstelle der Länder für Sicherheitstechni | none | nicht-in-juris |
| 820-2-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Bestimmung aufsichtsführender Länder nach Artikel 87  | none | nicht-in-juris |
| 8221-1-1 | Landesverordnung zur Übertragung von Zuständigkeiten auf die Staatliche Arbeitsschutzbehörde bei der Unfallkasse Schlesw | none | nicht-in-juris |
| 8221-1-6 | Landesverordnung zur Ermittlung und Festlegung von Ausgleichszahlungen an die Unfallkasse Nord für die Jahre 2023 bis 20 | title-only | nur-titelaehnlichkeit-ungeprueft |
| 9510-3-1 | Bekanntmachung über das Inkrafttreten der Zusatzvereinbarung zur Vereinbarung über die Ausübung der schifffahrtpolizeili | none | nicht-in-juris |
| 9510-4-1 | Bekanntmachung über das Inkrafttreten der Vereinbarung über die Errichtung des Havariekommandos und der Vereinbarung übe | none | nicht-in-juris |
| B 200-0-41 | Landesverordnung zur Bestimmung der Zuständigkeiten der oberen Fischereibehörde und zur Schaffung einer Datenübermittlun | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 200-0-48 | Aufhebung der Landesverordnung zur Durchführung des Düngegesetzes und der auf seiner Grundlage erlassenen Verordnungen A | none | nicht-in-juris |
| B 4100-1-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen dem Land Nordrhein-Westfalen und dem Land Schleswig-H | none | nicht-in-juris |
| B 613-5-1-1 | Verordnung zur Ausführung des Reichsgesetzes über die Verfrachtung alkoholischer Waren vom 14. April 1926 (RGBl. II S. 2 | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 660-3-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |
| B 660-4 | Gesetz zum Staatsvertrag zwischen der Freien und Hansestadt Hamburg und dem Land Schleswig-Holstein zur Änderung des Sta | none | nicht-in-juris |
| B 660-5-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 7820-7-5 | Aufhebung der Landesverordnung über Meldepflichten in Bezug auf Wirtschaftsdünger Art. 5 vom 25.5.2021, GVOBl. S. 656 | none | nicht-in-juris |
| B 791-8-8 | Landesverordnung zur Abwendung von Schäden durch Kormorane | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-13 | Landesverordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-16 | Landesverordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-19 | Landesverordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-22 | Landesverordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-24 | Landesverordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-4 | Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-5 | Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-6 | Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-8 | Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 820-1-9 | Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| B 96-2-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg und dem Land Schles | none | nicht-in-juris |

**ab-erlassverzeichnis: nicht streng gefunden (162)**

| Gl.Nr. | Titel laut Register | Stufe | Einordnung |
| --- | --- | --- | --- |
| 1103.24 | Ausübung des Begnadigungsrechts | title-only | nur-titelaehnlichkeit-ungeprueft |
| 1131.37 | Stiftung des Flut-Ehrenzeichens 2023 des Landes Schleswig-Holstein aus Anlass der Ostseeflut im Oktober 2023 | none | nicht-in-juris |
| 1141.7 | Grundsätze für Veröffentlichungen im Amtsblatt für Schleswig-Holstein und für Verkündungen im Gesetz- und Verordnungsbla | gl-amendment-only | nur-aenderungsakt-in-juris |
| 140.39 | Öffentlich-rechtlicher Vertrag (Aufgabenübertragung des Kreises Herzogtum Lauenburg) | none | nicht-in-juris |
| 2002.13 | Richtlinie über die Förderung der Prävention in Schleswig-Holstein durch den Landespräventionsrat | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2002.14 | Beschleunigte Aktenauskunft bei Verkehrsunfällen zum Zwecke der Schadensregulierung | none | nicht-in-juris |
| 201.53 | Vertretung des Landes Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| 201.72 | Vertretung des Landes Schleswig-Holstein im Geschäftsbereich des Ministeriums für Energiewende, Landwirtschaft, Umwelt,  | gl-amendment-only | nur-aenderungsakt-in-juris |
| 201.78 | Vertretung des Landes Schleswig-Holstein für den Geschäftsbereich der Landesjustizverwaltung | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2010.23 | Hausordnung des Schleswig-Holsteinischen Landtages | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2012.27 | Wegfall der Kostenerstattung in Strafsachen zwischen Justizbehörden und Polizeibehörden | none | nicht-in-juris |
| 2014.7 | Vereinbarung nach § 59 MBG SH zur Überführung von papierbasierten in elektronische Personalakten durch Digitalisierung ( | none | nicht-in-juris |
| 2015.19 | Landeseinheitliche Rahmenvorgabe des CIO der Landesregierung Schleswig-Holstein zum ersetzenden Scannen in der Landesver | none | nicht-in-juris |
| 2020.39 | Allgemeine Vertragsbedingungen für die Jahresabschlussprüfung kommunaler Wirtschaftsbetriebe (AV-Jap) | none | nicht-in-juris |
| 2022.68 | Richtlinie zur Gewährung von Fehlbetrags- und Sonderbedarfszuweisungen (§§ 17 und 18 FAG) | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2030.42 | Grundlagenvereinbarung zur Einführung und Nutzung des integrierten HR IT-Personalmanagementverfahrens – P & I als Grundl | none | nicht-in-juris |
| 2030.44 | 1. Ergänzungsvereinbarung zur Grundlagenvereinbarung über die Einführung und Nutzung des integrierten HR IT-Personalmana | none | nicht-in-juris |
| 2030.45 | 2. Ergänzungsvereinbarung zur Grundlagenvereinbarung über die Einführung und Nutzung des integrierten HR IT-Personalmana | none | nicht-in-juris |
| 2030.48 | 3. Ergänzungsvereinbarung zur Grundlagenvereinbarung über die Einführung und Nutzung des integrierten HR IT-Personal- ma | none | nicht-in-juris |
| 2030.57 | Übertragung personalrechtlicher Befugnisse im Geschäftsbereich der Landesregierung (Delegationserlass) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2030.61 | Übertragung von personalrechtlichen Befugnissen im Geschäftsbereich des Ministeriums für Inneres, ländliche Räume und In | none | nicht-in-juris |
| 2030.62 | Übertragung personalrechtlicher Befugnisse im Geschäftsbereich des Ministeriums für Wirtschaft, Verkehr, Arbeit, Technol | none | nicht-in-juris |
| 2030.64 | Übertragung von personalrechtlichen Befugnissen im Geschäftsbereich des Ministeriums für Soziales, Jugend, Familie, Seni | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2030.65 | Übertragung von personalrechtlichen Befugnissen im Geschäftsbereich des Ministeriums für Soziales, Jugend, Familie, Seni | none | nicht-in-juris |
| 2031.41 | Vereinbarung mit den Spitzenorganisationen der Gewerkschaften nach § 59 Mitbestimmungsgesetz Schleswig-Holstein über die | none | nicht-in-juris |
| 2031.82 | Durchführungshinweise zum Nebentätigkeitsrecht | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2032.84 | Durchführungshinweise (DFH) zur Landesverordnung über die Gewährung von Beihilfen an Beamtinnen und Beamte in Schleswig- | none | nicht-in-juris |
| 2034.43 | Bewertung der Personalunterkünfte für Angestellte und Arbeiter (Tarifverträge) | none | nicht-in-juris |
| 2121.16 | Richtlinie für die staatliche Anerkennung von Einrichtungen zur Behandlung betäubungsmittelabhängiger Straftäter im Sinn | none | nicht-in-juris |
| 2121.40 | Verwaltungsvorschrift zu Informationswegen und Maßnahmen bei Arzneimittelzwischenfällen zu Tierarzneimitteln nach Verord | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2126.68 | Richtlinie zur Förderung von Maßnahmen der Beratung im Umgang mit traumatisierten Kindern und Jugendlichen in Einrichtun | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2126.71 | Richtlinie über die Gewährung von Zuwendungen zur Förderung der Prävention gegen HIV, Aids, sexuell übertragbare Infekti | none | nicht-in-juris |
| 2129.18 | Feststellung und Beurteilung von Geruchsimmissionen in Schleswig- Holstein (Geruchsimmissions-Richtlinie – GIRL -) | none | nicht-in-juris |
| 2129.23 | Einführung der aktualisierten LAGA-Mitteilung „Vollzugshilfe zur Entsorgung asbesthaltiger Abfälle“ | none | nicht-in-juris |
| 2134.14 | Richtlinie zur Umsetzung des Landesprogramms zur Förderung des Einsatzes von erneuerbaren Energien im Strom- und Wärmebe | none | nicht-in-juris |
| 2135.48 | Dienstkleidungsvorschrift für Mitarbeiterinnen und Mitarbeiter des Landes Schleswig-Holstein im zuständigen Referat für  | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2135.56 | Liste der im Land Schleswig-Holstein anerkannten Prüfingenieure für Brandschutz - Stand 26. September 2023 - | none | nicht-in-juris |
| 2161.12 | Pflegegeld in der Jugendhilfe – Festsetzung der Pauschalbeträge für laufende Leistungen zum Unterhalt nach § 39 Abs. 5 S | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2161.16 | Richtlinie über die Förderung von Jugendberufsagenturen in Schleswig- Holstein | none | nicht-in-juris |
| 2161.5 | Richtlinien für die Anerkennung von Trägern der freien Jugendhilfe (Anerkennungsrichtlinien) | gl-amendment-only | nur-aenderungsakt-in-juris |
| 231.7 | Städtebauförderungsrichtlinien des Landes Schleswig-Holstein i.d.F.vom 1. Januar 2015 (StBauFR SH 2015) | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2330.76 | Durchführung des Schleswig-Holsteinischen Wohnraumförderungsgesetzes (SHWoFG); Dynamisierte Veränderung der Einkommensgr | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2330.81 | Sonderprogramm „Neue Perspektive Wohnen“ – Förderrichtlinie 1 Wohnquartiere (NPW – F1) | none | nicht-in-juris |
| 2330.82 | Sonderprogramm „Neue Perspektive Wohnen“ – Förderrichtlinie 2 Investitionszuschüsse für Wohneigentum in neuen Quartieren | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2330.87 | Richtlinie für das Zuschussprogramm Einbruchschutz für selbstgenutztes Wohneigentum und selbstgenutzte Mietwohnimmobilie | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2330.88 | Richtlinie über die Herrichtung von Wohnraum und Unterkünften für Geflüchtete | gl-amendment-only | nur-aenderungsakt-in-juris |
| 2330.90 | Durchführung des Schleswig-Holsteinischen Wohnraumförderungsgesetzes (SHWoFG); Dynamisierte Veränderung der Einkommensgr | title-only | nur-titelaehnlichkeit-ungeprueft |
| 2330.95 | Richtlinie zur Beteiligung des Landes Schleswig-Holstein am Betrieb von temporären kommunalen Gemeinschaftsunterkünften  | none | nicht-in-juris |
| 3111.5 | Richtlinie zur Förderung von "geeigneten Stellen im Sinne von § 305 Insolvenzordnung“ (InsO) | none | nicht-in-juris |
| 3121.6 | Aussetzung von Belohnungen für die Mitwirkung von Privatpersonen bei der Aufklärung von Straftaten | none | nicht-in-juris |
| 3121.7 | Geldbelohnungen für die Mitwirkung von Personen aus der Bevölkerung bei der Aufklärung von Straftaten – ergänzende Regel | none | nicht-in-juris |
| 3121.8 | Aussetzung von Belohnungen für die Mitwirkung von Privatpersonen bei der Aufklärung von Straftaten | none | nicht-in-juris |
| 4500.15 | Zusammenarbeit von Staatsanwaltschaft und Polizei | title-only | nur-titelaehnlichkeit-ungeprueft |
| 4500.9 | Richtlinie zur Umsetzung des § 31 a des Betäubungsmittelgesetzes | title-only | nur-titelaehnlichkeit-ungeprueft |
| 613.1 | Bescheinigungsrichtlinien zur Anwendung der §§ 7 h, 10 f und 11 a des Einkommensteuergesetzes (EStG) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 613.2 | Bescheinigungsrichtlinien zur Anwendung der §§ 7 i, 10 f und 11 b des Einkommensteuergesetzes (EStG) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 613.3 | Bescheinigungsrichtlinien zur Anwendung des § 10 g des Einkommensteuergesetzes (EStG) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 625.65 | Richtlinie für die Unterstützung kleiner und mittlerer Unternehmen wegen stark gestiegener Energiekosten (Energie-Härtef | gl-amendment-only | nur-aenderungsakt-in-juris |
| 625.68 | Richtlinie des Ministeriums für Allgemeine und Berufliche Bildung, Wissenschaft, Forschung und Kultur des Landes Schlesw | none | nicht-in-juris |
| 631.3 | Richtlinie über die Gewährung von Konsolidierungshilfen (§ 11 FAG) | none | nicht-in-juris |
| 651.1 | Richtlinien für die Übernahme von Bürgschaften des Landes Schleswig- Holstein (Bürgschaftsrichtlinien) | none | nicht-in-juris |
| 6600.30 | Richtlinie für die Gewährung von Zuwendungen zur Förderung der digitalen Transformation in Kultureinrichtungen – Förderp | none | nicht-in-juris |
| 6600.31 | Richtlinie zur Vergabe der Finanzhilfe aus der Zusatz- Verwaltungsvereinbarung „Administration“ zum DigitalPakt Schule 2 | none | nicht-in-juris |
| 6600.32 | Richtlinie zur Vergabe der Finanzhilfen aus dem DigitalPakt Schule 2019 bis 2024 an die Träger der Schulen der dänischen | none | nicht-in-juris |
| 6600.33 | Richtlinie zur Vergabe der Finanzhilfen aus dem DigitalPakt Schule 2019 bis 2024 an die Träger der öffentlichen Schulen  | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6600.35 | Richtlinie über die Gewährung von Zuwendungen zur Förderung des Beratungsnetzwerks Weiterbildung | none | nicht-in-juris |
| 6600.40 | Kompetenzteams Inklusion – Förderung der freien Träger und Kommunen zur Umsetzung von inklusiven Unterstützungsleistunge | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6600.41 | Auswahl- und Fördergrundsätze und Regeln für die finanzielle Unterstützung im Rahmen des Landesprogramms Wirtschaft 2021 | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6600.45 | Richtlinie über die Förderung zusätzlich erforderlicher Beratungsangebote der kommunalen Schuldnerberatungsstellen aufgr | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6601.52 | Förderrichtlinie zum Programm zur Förderung der Innenstadtentwicklung und der Stadt- und Ortszentren (Innenstadtprogramm | none | nicht-in-juris |
| 6602.15 | Aufruf für die Gewährung von Zuwendungen zur Förderung der datenbasierten Verwaltung (und zielgerichteter Zusammenführun | none | nicht-in-juris |
| 6603.23 | Richtlinie des Landes Schleswig-Holstein für die Gewährung von Zuwendungen zur Förderung nachhaltiger Wärmeversorgungssy | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6604.13 | Richtlinie für die Gewährung von Zuwendungen zur Förderung der Errichtung von Landstromanlagen in gewerblichen Häfen in  | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6605.25 | Richtlinie über Zuwendungen des Landes Schleswig-Holstein für Maßnahmen zur Mobilitäts- und Verkehrserziehung | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6606.29 | Richtlinie für die Gewährung von Zuwendungen zur Förderung von Maßnahmen zur Darstellung Schleswig-Holsteins als Innovat | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6606.40 | Richtlinie des Landes Schleswig-Holstein für die Gewährung von Zuwendungen zur Förderung von anwendungsorientierter Fors | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6607.22 | Richtlinie über die Gewährung von Zuwendungen zur Förderung von Maßnahmen zur Steigerung der Biodiversität im Tourismus | none | nicht-in-juris |
| 6607.23 | Richtlinie zur Förderung der Wiederherstellung von Küstenschutzanlagen in Schleswig-Holstein nach der Flutkatastrophe vo | none | nicht-in-juris |
| 6608.38 | Förderrichtlinie zur Förderung von Veranstaltungen zur Qualifizierung, Fort- und Weiterbildung von Fachkräften in Kinder | none | nicht-in-juris |
| 6608.43 | Richtlinie für die Gewährung von Zuwendungen zur investiven Förderung überbetrieblicher Berufsbildungsstätten der Aus- u | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6608.44 | Richtlinie über die Förderung von zukunftsweisenden Projekten zur Unterstützung der dualen Ausbildung | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6608.47 | Richtlinie über die Förderung von Projekten und Maßnahmen zur Fachkräftesicherung | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6608.48 | Richtlinie zur Förderung des Personalaufwuchses in den Gesundheitsämtern i.R. der Umsetzung des Paktes für den ÖGD für | none | nicht-in-juris |
| 6609.7 | Richtlinie über die Vergabe von Fördermitteln für die Unterstützung von ehrenamtlichen Strukturen im kommunalen Raum | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6609.8 | Richtlinie über Zuwendungen aus Finanzhilfen für den kommunalen Straßenbau in Schleswig-Holstein | none | nicht-in-juris |
| 6611.31 | Richtlinie über die Gewährung von Ausgleichszahlungen im schleswig-holsteinischen Vertragsnaturschutz (Vertragsnaturschu | none | nicht-in-juris |
| 6611.35 | Richtlinie für die Gewährung von Zuwendungen in Natura 2000- Gebieten - Natura 2000-Prämie - | none | nicht-in-juris |
| 6612.47 | Richtlinie für die Gewährung von Zuwendungen für die Arbeit von Naturschutzverbänden in Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6612.49 | Richtlinien für die Gewährung von Zuwendungen für verschiedene Maßnahmen des Artenschutzes | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6613.24 | Verwaltungsvorschrift zur Neuregelung des Landeszuschusses zu den Aufwendungen der Unterhaltung von Gewässern, der Unter | none | nicht-in-juris |
| 6613.25 | Richtlinie zur Förderung von Maßnahmen zur Abwasserbehandlung in Schleswig-Holstein | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6614.10 | Richtlinie für die Gewährung von Zuwendungen für verschiedene Maßnahmen des Tierschutzes | none | nicht-in-juris |
| 6615.11 | Erlass über die Berücksichtigung von Flächen mit Bodenbelastungen, insbesondere Altlasten, in der Bauleitplanung und im  | none | nicht-in-juris |
| 6615.12 | Richtlinie für die Gewährung von Zuwendungen zum Schutz gegen Gefahren durch Altlasten und zur Wiedernutzung brachliegen | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6618.4 | Richtlinie über die Gewährung von Zuwendungen für private Einrichtungen der Daseinsvorsorge für Wiederaufbaumaßnahmen in | none | nicht-in-juris |
| 6620.45 | Richtlinie zur Projektförderung für die ökologische Landwirtschaft | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6620.46 | Richtlinie über die Gewährung von Zuwendungen zur Förderung von Investitionen landwirtschaftlicher Unternehmen aus Schle | none | nicht-in-juris |
| 6620.50 | Richtlinie über die Gewährung von Zuwendungen zur Förderung von Investitionen im Bereich der Verarbeitung und Vermarktun | none | nicht-in-juris |
| 6620.52 | Richtlinie über die Gewährung von Ausgleichszahlungen zur Förderung der dauerhaften Umwandlung von Ackerland in Grünland | none | nicht-in-juris |
| 6620.55 | Richtlinie zur Förderung der Umsetzung von LEADER in Schleswig- Holstein für die Förderperiode 2015 bis 2022/25 | none | nicht-in-juris |
| 6620.57 | Richtlinie über die Gewährung von Zuwendungen zur Förderung von Investitionen in landwirtschaftlichen Unternehmen in Sch | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6621.59 | Richtlinie für die Förderung forstwirtschaftlicher Maßnahmen als Gemeinschaftsaufgabe "Verbesserung der Agrarstruktur un | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6623.56 | Richtlinie über die Gewährung von Zuwendungen zur Förderung der Zucht und Erhaltung von gefährdeten Nutztierrassen in Sc | none | nicht-in-juris |
| 6623.57 | Richtlinien für die Gewährung von Beihilfen für Maßnahmen zum Schutz gegen die Leukose der Rinder und gegen die Brucello | none | nicht-in-juris |
| 6623.61 | Richtlinien für die Gewährung von Zuwendungen für verschiedene Maßnahmen auf dem Gebiet der Tierzucht | none | nicht-in-juris |
| 6623.62 | Richtlinie über die Gewährung von Zuwendungen zur Förderung von Investitionen in teilmobile Schlachteinheiten in Schlesw | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6623.63 | Richtlinie für die Gewährung von Zuwendungen zur Impfung gegen den Serotyp 3 des Virus der Blauzungenkrankheit (BTV3-Ric | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6623.64 | Richtlinie für die Gewährung von Zuwendungen für verschiedene Maßnahmen auf dem Gebiet der landwirtschaftlichen Tierzuch | none | nicht-in-juris |
| 6640.15 | Richtlinie über Zuweisungen für Theater und Orchester nach § 20 des Finanzausgleichsgesetzes | none | nicht-in-juris |
| 6640.17 | Richtlinie für die Landesförderung der professionellen freien Theater und Künstlerinnen und Künstler der Freien Darstell | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6640.18 | Neufassung der Richtlinie über die Gewährung von Investitionsförderung für die freie Kulturszene und kleine Kultureinric | none | nicht-in-juris |
| 6641.21 | Richtlinie über die Förderung von kommunalen Sportstätten in Schleswig-Holstein (Sportstättenförderrichtlinie) | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6641.24 | Richtlinie über die Förderung von Sportveranstaltungen in Schleswig- Holstein (Sportveranstaltungs-Förderrichtlinie) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6641.26 | Richtlinie über die Förderung von kommunalen Sportstätten in Schleswig-Holstein (Sportstättenförderrichtlinie) | none | nicht-in-juris |
| 6641.27 | Richtlinie über die Förderung des E-Sport in Schleswig-Holstein (E- Sport-Förderrichtlinie) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6642.48 | Richtlinie zur Vergabe von Finanzhilfen zur Abfederung von gestiegenen Energiekosten im Bereich Schule | none | nicht-in-juris |
| 6642.49 | Richtlinie über die Gewährung von Zuschüssen zu den Kosten der Unterbringung bei notwendiger auswärtiger Unterkunft für  | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6642.53 | Richtlinie zur Genehmigung und Förderung von Offenen Ganztagsschulen sowie zur Einrichtung und Förderung von Betreuungsa | none | nicht-in-juris |
| 6646.12 | Richtlinie für die Gewährung von Zuwendungen aus dem Investitionsprogramm Kulturelles Erbe (IKE) | none | nicht-in-juris |
| 6646.13 | Richtlinie für die Übernahme von Landesgarantien zur Förderung der kulturellen Aktivitäten | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6646.14 | Richtlinie für die Gewährung von Zuwendungen zur Förderung von Kulturprojekten | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6650.10 | Richtlinie zur Förderung von Feuerwehrhäusern in Schleswig-Holstein | none | nicht-in-juris |
| 6651.4 | Verwaltungsvorschrift über die Aufnahme von bundes- und landeseigenen Löschfahrzeugen Katastrophenschutz (LF KatS) im La | none | nicht-in-juris |
| 6660.22 | Richtlinie zur Förderung von Investitionen in Frauenberatungsstellen | none | nicht-in-juris |
| 6662.24 | Richtlinie zur Umsetzung des Kommunalinvestitionsförderungs- gesetzes des Bundes zur energetischen Sanierung von Einrich | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6662.46 | Richtlinie des Landes Schleswig-Holstein zum Ausbau von Betreuungsplätzen in Kindertageseinrichtungen und Kindertagespfl | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6662.59 | Richtlinie. für die institutionelle Förderung der auf Landesebene anerkannten Jugendverbände (Verbandsrichtlinie) | gl-amendment-only | nur-aenderungsakt-in-juris |
| 6662.61 | Richtlinie zur Förderung des internationalen Jugendaustausches | none | nicht-in-juris |
| 6662.64 | Richtlinie zur Förderung von Ferien- und Freizeitmaßnahmen mit Kindern und Jugendlichen (Jugendferienwerksrichtlinien) | none | nicht-in-juris |
| 6662.69 | Fachberatung Landesprogramm Sprach-Kitas - Förderung freier und kommunaler Träger zur Umsetzung der Fachberatungsstellen | none | nicht-in-juris |
| 6662.70 | Förderrichtlinie zum Landesprogramm Förderung von Maßnahmen freier Träger und Kommunen zur Fachkräftegewinnung in der fr | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6662.73 | Kompetenzteams Inklusion – Förderung der freien Träger und Kommunen zur Umsetzung von inklusiven Unterstützungsleistunge | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6662.75 | Richtlinie über die Gewährung von Zuwendungen für das Jugendaufbauwerk Schleswig-Holstein | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6663.3 | Richtlinien zur Förderung von Projekten zum Themenkomplex „Vielfalt geschlechtlicher und sexueller Identitäten“ im Rahme | none | nicht-in-juris |
| 6663.4 | Richtlinie zur Förderung von Antidiskriminierungs- und Bildungsprojekten zum Themenkomplex „Vielfalt geschlechtlicher un | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6664.4 | Richtlinie zur Förderung von seniorenpolitischen Maßnahmen in Schleswig-Holstein | none | nicht-in-juris |
| 6666.20 | Richtlinie zur Förderung von Koordinierungsstellen für Integration und Teilhabe in den Kreisen und kreisfreien Städten ( | none | nicht-in-juris |
| 6666.21 | Richtlinie zur Förderung von Maßnahmen für Teilhabe und Zusammenhalt auf lokaler Ebene (MaTZ) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6666.25 | Richtlinie über die Vergabe von Fördermitteln für die Einrichtung von Beratungsstellen für ehrenamtliche Flüchtlingshilf | none | nicht-in-juris |
| 6666.26 | Richtlinie über die Vergabe von Fördermitteln für die Einrichtung und Verstetigung von hauptamtlichen Stellen zur Koordi | none | nicht-in-juris |
| 6666.30 | Richtlinie des Ministeriums für Soziales, Jugend, Familie Senioren, Integration und Gleichstellung des Landes Schleswig- | none | nicht-in-juris |
| 6670.18 | Richtlinie zur Stärkung der ehrenamtlichen Mitarbeit und Förderung von Selbsthilfegruppen im sozialen Bereich | none | nicht-in-juris |
| 6670.20 | Richtlinie zur Förderung des Freiwilligen Sozialen Jahres in Schleswig- Holstein (FSJ-Richtlinie) | title-only | nur-titelaehnlichkeit-ungeprueft |
| 6670.24 | Richtlinie zur Förderung von Einrichtungen, Bau- und Infrastrukturmaßnahmen zur Verbesserung der Wohnraumsituation für S | none | nicht-in-juris |
| 6671.21 | Richtlinie zur Gewährung von Zuschüssen für die Mietausgaben von bisherigen Altenpflegeschulen | none | nicht-in-juris |
| 6671.23 | Richtlinie zur Gewährung von Zuschüssen für Investitionen an Altenpflegeschulen bzw. ehemaligen Altenpflegeschulen | none | nicht-in-juris |
| 6671.24 | Richtlinie zur Gewährung von Zuschüssen für die Investitionskosten von bisherigen Altenpflegeschulen | none | nicht-in-juris |
| 6671.26 | Richtlinie über die Gewährung von Zuwendungen zur Förderung des Ausbaus solitärer Kurzzeitpflegeplätze | none | nicht-in-juris |
| 6671.30 | Richtlinie zur Gewährung von Zuschüssen für Investitionen zum Ausbau der sektorenübergreifenden medizinischen Versorgung | none | nicht-in-juris |
| 751.3 | Richtlinie „Bürgschaftsprogramm Wärmenetze Schleswig-Holstein“ | title-only | nur-titelaehnlichkeit-ungeprueft |
| 7510.10 | Maßnahmen bei widerrechtlichem Umgang mit radioaktiven Stoffen | none | nicht-in-juris |
| 7510.9 | Schiffstransporte von Kernbrennstoffen und Großquellen durch den Nord-Ostsee-Kanal; hier: Atomrechtliche Kontrollen durc | title-only | nur-titelaehnlichkeit-ungeprueft |
| 7910.6 | Verwaltungsvorschrift über Vollzugserleichterungen bei der Überwachung von Standorten, die nach der EG-Umweltaudit- Vero | none | nicht-in-juris |
| 7914.3 | Ermittlung von Emissionen und Immissionen von luftverunreinigenden Stoffen, Geräuschen und Erschütterungen sowie Prüfung | none | nicht-in-juris |
| 793.27 | Erklärung von Teilen der Küstengewässer zu Muschelkulturbezirken | title-only | nur-titelaehnlichkeit-ungeprueft |
| 8520.13 | Richtlinie des Landes Schleswig-Holstein zur Umsetzung des Bundesinvestitionsprogramm „Kinderbetreuungsfinanzierung“ 202 | gl-amendment-only | nur-aenderungsakt-in-juris |
| 8530.8 | Richtlinie zur Förderung allgemeiner sozialer Maßnahmen wohlfahrtsverbandsunabhängiger Träger | title-only | nur-titelaehnlichkeit-ungeprueft |
| 860.10 | Richtlinie über die Gewährung von Billigkeitsleistungen als Härtefallhilfen für soziale Vereine und Verbände sowie für T | none | nicht-in-juris |
| 860.11 | Richtlinie über die Gewährung von Billigkeitsleistungen als Härtefallhilfen für soziale Vereine und Verbände (hier insbe | none | nicht-in-juris |
| 860.8 | Richtlinie über die Gewährung von Zuwendungen zur Investition eines bedarfsgerechten Ausbaus stationärer und teilstation | gl-amendment-only | nur-aenderungsakt-in-juris |
| 860.9 | Fonds zur Abdeckung sozialer Härten, insbesondere zur Abmilderung der Folgen gestiegener Energiepreise (Billigkeitsricht | gl-amendment-only | nur-aenderungsakt-in-juris |
| 9510.6 | Allgemeinverfügung der obersten Hafenbehörde, die sich an alle Hafenbetreiber im Lande Schleswig-Holstein richtet | none | nicht-in-juris |


## 4 baseline-only-Kandidaten des Ereignisregisters

54 Kandidaten (Vorschrift endete nach dem Stichtag), 49 einem juris-Dokument zugeordnet (Gliederungsnummer + Ausfertigungsdatum bzw. eindeutige Gliederungsnummer). Ausgänge: import-ready 33 · review 8 · reconstruction 6 · not-matched 5 · not-at-baseline 2.

| Ereignis | Datum | Gl.Nr. | Titel | juris | Ausgang |
| --- | --- | --- | --- | --- | --- |
| gvobl-systematische-uebersicht-p0052-l02 | 2023-12-19 | 2020-3-36 | Landesverordnung über die Aufstellung und Ausführung des Haushaltsplan | jlr-NNLSH00002AFF | import-ready |
| gvobl-systematische-uebersicht-p0050-l02 | 2023-12-31 | 2013-2-63 | Landesverordnung über Verwaltungsgebühren für Pflanzenschutzangelegenh | jlr-NNLSH00002FCD | review |
| gvobl-systematische-uebersicht-p0052-l03 | 2023-12-31 | 2020-3-37 | Landesverordnung über die Kassenführung der Gemeinden mit einer Hausha | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0052-l05 | 2023-12-31 | 2020-3-41 | Landesverordnung über die Aufstellung und Ausführung eines kameralen H | jlr-NNLSH00002DE1 | import-ready |
| gvobl-systematische-uebersicht-p0083-l04 | 2023-12-31 | 2120-22-1 | Landesverordnung zur Durchführung des Schleswig-Holsteinischen Rettung | jlr-NNLSH00003088 | review |
| gvobl-systematische-uebersicht-p0105-l00 | 2023-12-31 | 2131-2-7 | Landesverordnung über die Entschädigung der Wehrführungen der freiwill | jlr-NNLSH00002BCE | import-ready |
| gvobl-systematische-uebersicht-p0273-l03 | 2023-12-31 | B 865-1-1 | Landesverordnung über Inhalte des Rahmenvertrags nach § 131 SGB IX zur | jlr-NNLSH00003283 | review |
| gvobl-systematische-uebersicht-p0066-l03 | 2024-01-31 | 2030-16-34 | Landesverordnung über die Laufbahn der Laufbahngruppe 2 in der Fachric | jlr-NNLSH00002D66 | review |
| gvobl-systematische-uebersicht-p0128-l04 | 2024-01-31 | 223-9-244 | Landesverordnung über die Arbeitszeit von Studienleiterinnen und Studi | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0129-l00 | 2024-01-31 | 223-9-246 | Landesverordnung über die Arbeitszeit von Studienleitungen des Schlesw | jlr-NNLSH00002D63 | import-ready |
| gvobl-systematische-uebersicht-p0156-l04 | 2024-02-26 | 301-11-4 | Landesverordnung über die Ausbildung der Juristinnen und Juristen (Jur | jlr-NNLSH00002F66 | import-ready |
| gvobl-systematische-uebersicht-p0066-l01 | 2024-04-04 | 2030-16-28 | Landesverordnung über die Laufbahn, Ausbildung und Prüfung der Laufbah | jlr-NNLSH00002D5C | reconstruction |
| gvobl-systematische-uebersicht-p0002-l01 | 2024-05-02 | 100-9 | Geschäftsordnung des Schleswig-Holsteinischen Landesverfassungsgericht | jlr-NNLSH00002D2F | reconstruction |
| gvobl-systematische-uebersicht-p0088-l03 | 2024-06-01 | 2122-10-1 | Landesverordnung über die Finanzierung der Pflegeberufeausbildung (Sch | jlr-NNLSH00003149 | import-ready |
| gvobl-systematische-uebersicht-p0114-l02 | 2024-06-06 | 221-24-18 | Landesverordnung über die Übertragung von Bauaufgaben auf das Universi | jlr-NNLSH00002D16 | reconstruction |
| gvobl-systematische-uebersicht-p0195-l00 | 2024-06-06 | 753-2-133 | Landesverordnung über die Selbstüberwachung von Abwasseranlagen und Ab | jlr-NNLSH00002D19 | reconstruction |
| gvobl-systematische-uebersicht-p0179-l05 | 2024-06-30 | 707-4-22 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Inves | jlr-NNLSH0000327F | import-ready |
| gvobl-systematische-uebersicht-p0256-l01 | 2024-07-24 | B 791-8-8 | Landesverordnung zur Abwendung von Schäden durch Kormorane | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0037-l05 | 2024-08-01 | 200-0-385 | Landesverordnung über die Errichtung eines Prüfungsausschusses am Fach | jlr-NNLSH00002D46 | import-ready |
| gvobl-systematische-uebersicht-p0149-l06 | 2024-09-29 | 230-2-4 | Landesverordnung zur Festlegung der Zentralen Orte und Stadtrandkerne  | jlr-NNLSH00002D3F | review |
| gvobl-systematische-uebersicht-p0092-l01 | 2024-11-01 | 2126-12-4 | Landesverordnung zur Durchführung eines Mammographie-Screenings | jlr-NNLSH00002D33 | import-ready |
| gvobl-systematische-uebersicht-p0083-l00 | 2024-12-31 | 2120-14-5 | Landesverordnung über Gesundheitsberufe | jlr-NNLSH0000305E | import-ready |
| gvobl-systematische-uebersicht-p0084-l00 | 2024-12-31 | 2120-23-1 | Landesverordnung über die Festsetzung der pauschalen Förderung nach §  | jlr-NNLSH00002D1E | reconstruction |
| gvobl-systematische-uebersicht-p0089-l01 | 2024-12-31 | B 2122-10-2 | Landesverordnung über die Ausbildung und Durchführung der Pflegeberufe | jlr-NNLSH0000314D | import-ready |
| gvobl-systematische-uebersicht-p0100-l05 | 2024-12-31 | 2130-14-22 | Landesverordnung über Anforderungen an Herstellerinnen und Hersteller  | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0100-l06 | 2024-12-31 | 2130-14-23 | Landesverordnung über die Anerkennung als Prüf-, Überwachungs- oder Ze | jlr-NNLSH0000303F | import-ready |
| gvobl-systematische-uebersicht-p0110-l04 | 2024-12-31 | 2186-25-1 | Landesverordnung über Zweckabgaben für in öffentlicher Trägerschaft ve | jlr-NNLSH00002BC9 | import-ready |
| gvobl-systematische-uebersicht-p0179-l04 | 2024-12-31 | 707-4-18 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Inves | jlr-NNLSH0000305C | import-ready |
| gvobl-systematische-uebersicht-p0270-l05 | 2024-12-31 | B 850-1-2 | Landesverordnung über das Verfahren der Evaluation nach dem Kindertage | jlr-NNLSH00003048 | import-ready |
| gvobl-systematische-uebersicht-p0277-l00 | 2024-12-31 | 90-1-13 | Landesverordnung über die Kostentragung bei der Verwaltung von Kreisst | jlr-NNLSH00003023 | import-ready |
| gvobl-systematische-uebersicht-p0051-l00 | 2025-01-31 | 2013-2-69 | Landesverordnung über Gebühren des Landesamtes für Vermessung und Geoi | jlr-NNLSH00002BD4 | review |
| gvobl-systematische-uebersicht-p0090-l01 | 2025-01-31 | 2124-3-7 | Landesverordnung über die Vergütung für Leistungen der Hebammen und En | jlr-NNLSH00002BB9 | import-ready |
| gvobl-systematische-uebersicht-p0112-l04 | 2025-01-31 | 219-8-9 | Landesverordnung über die Vergütung der Öffentlich bestellten Vermessu | jlr-NNLSH00002BD1 | import-ready |
| gvobl-systematische-uebersicht-p0101-l00 | 2025-02-28 | 2130-14-24 | Landesverordnung über die Überwachung von Tätigkeiten mit Bauprodukten | jlr-NNLSH0000300D | import-ready |
| gvobl-systematische-uebersicht-p0101-l01 | 2025-02-28 | 2130-14-25 | Landesverordnung über das Übereinstimmungszeichen (Übereinstimmungszei | jlr-NNLSH00003046 | import-ready |
| gvobl-systematische-uebersicht-p0175-l05 | 2025-05-07 | 630-2-1 | Landesverordnung über das Verfahren zur Bestimmung der Konjunkturkompo | jlr-NNLSH00003047 | import-ready |
| gvobl-systematische-uebersicht-p0045-l02 | 2025-05-30 | 2011-0-21 | Landesverordnung zur Abwehr von Gefahren für die öffentliche Sicherhei | jlr-NNLSH00002B66 | import-ready |
| gvobl-systematische-uebersicht-p0186-l04 | 2025-06-25 | 7220-4-3 | Landesverordnung zur Feststellung der repräsentativen Tarifverträge im | jlr-NNLSH00002B95 | review |
| gvobl-systematische-uebersicht-p0139-l01 | 2025-06-29 | 224-11-1 | Landesverordnung über den Denkmalrat (Denkmalratsverordnung) | jlr-NNLSH00002B51 | import-ready |
| gvobl-systematische-uebersicht-p0139-l02 | 2025-06-29 | 224-11-2 | Landesverordnung über die Vertrauensleute für Kulturdenkmale | jlr-NNLSH00002B4A | import-ready |
| gvobl-systematische-uebersicht-p0139-l03 | 2025-06-29 | 224-11-3 | Landesverordnung über die Einführung des Zustimmungsvorbehalts bei Gen | jlr-NNLSH00002B4C | import-ready |
| gvobl-systematische-uebersicht-p0139-l03 | 2025-06-29 | 224-11-4 | Landesverordnung über die Einführung des Zustimmungsvorbehalts bei Gen | jlr-NNLSH00002B4B | import-ready |
| gvobl-systematische-uebersicht-p0139-l04 | 2025-06-29 | 224-11-5 | Landesverordnung über das Verfahren zur Ausweisung von Denkmalbereiche | jlr-NNLSH00002B4E | import-ready |
| gvobl-systematische-uebersicht-p0139-l04 | 2025-06-29 | 224-11-6 | Landesverordnung über die Denkmallisten für Kulturdenkmale | jlr-NNLSH00002B4D | import-ready |
| gvobl-systematische-uebersicht-p0180-l00 | 2025-06-30 | 707-4-23 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Inves | jlr-NNLSH00002D21 | not-at-baseline |
| gvobl-systematische-uebersicht-p0077-l02 | 2025-07-09 | 204-5-3 | Landesverordnung über die zentrale Stelle für ressortübergreifende Per | jlr-NNLSH00002B42 | import-ready |
| gvobl-systematische-uebersicht-p0068-l04 | 2025-08-26 | 2031-3-3 | Landesverordnung über Dienstvorgesetzte der Polizei nach dem Landesdis | jlr-NNLSH00002FF3 | import-ready |
| gvobl-systematische-uebersicht-p0050-l04 | 2025-08-30 | 2013-2-65 | Landesverordnung über Verwaltungsgebühren in Angelegenheiten der Leben | jlr-NNLSH00002B1F | import-ready |
| gvobl-systematische-uebersicht-p0009-l05 | 2025-10-28 | 114-0-4 | Landesverordnung über die örtliche Bekanntmachung und Verkündung (Beka | jlr-NNLSH00002B12 | import-ready |
| gvobl-systematische-uebersicht-p0202-l02 | 2025-12-31 | 780-3-31 | Landesverordnung über die Wahl der Hauptversammlung der Landwirtschaft | jlr-NNLSH00003019 | review |
| gvobl-systematische-uebersicht-p0270-l06 | 2025-12-31 | B 850-1-3 | Landesverordnung über die Personalqualifikation in öffentlich geförder | jlr-NNLSH00002B9B | reconstruction |
| gvobl-systematische-uebersicht-p0277-l01 | 2025-12-31 | 90-1-14 | Landesverordnung über die Kostentragung bei der Verwaltung von Kreisst | jlr-NNLSH00002AF4 | not-at-baseline |
| gvobl-systematische-uebersicht-p0010-l02 | 2026-02-19 | 12-3-2 | Landesverordnung zur Feststellung der lebenswichtigen Einrichtungen im | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0272-l06 | 2026-06-10 | B 864-8-16 | Landesverordnung über die Freistellung für ehrenamtliche Mitarbeit in  | jlr-NNLSH00003029 | import-ready |

## 5 Regeln

Übernommen wird nur `import-ready` mit Regel B (starker Beginn bis zum Stichtag und starker Fortbestand) ohne widersprechendes Registerereignis. Alles andere bleibt draußen: Review-Fälle unter `data/imports/juris-sh/review/`, keine automatische Freigabe, kein Freeze. Die Einzeldaten je Dokument stehen in `corpus-inventory.json`.

