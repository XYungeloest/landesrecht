# Vollkorpus-Inventur juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts inventory --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

Netzfrei aus dem Cache von `fetch-corpus` (öffentliche PDF-Ausgabe). Je Dokument der Vollweg der Stichprobe: Parser → SH-Modell → Stichtag (bei späteren Änderungen die am Stichtag geltenden Einzelfassungen) → Überleitung SH → NSH → `validateNormRecord` → Textintegrität, dazu Stichtagsbelege mit dem bestehenden Ereignisregister (Regeln A/B/C). Parser `juris-sh-parser/1.0.0`, Überleitung `juris-sh-transformer/1.0.0`.

## 1 Ausgänge

| Kennzahl | Wert |
| --- | --- |
| Enumeriert | 5197 |
| Verarbeitet | 5197 |
| Ausgänge | import-ready 1910 · not-at-baseline 1720 · review 1505 · reconstruction 56 · failed 4 · not-cached 2 |
| Landesrecht | not-at-baseline 1115 · import-ready 1089 · review 558 · reconstruction 44 · not-cached 2 |
| Verwaltungsvorschriften | review 947 · import-ready 821 · not-at-baseline 605 · reconstruction 12 · failed 4 |
| Manifeststatus | not-at-baseline 1720 · needs-review 1561 · imported-with-warnings 1474 · imported 436 · failed 4 |
| Stichtagseinordnung der Ausgabe | unchanged-since-baseline 3040 · repealed-before-baseline 962 · enacted-after-baseline 761 · changed-after-baseline 259 · repealed-after-baseline 88 · undetermined 85 |
| Stichtagsregel (A/B/C) | B-strong-begin-and-continuity 3434 · A-strong-end-before-baseline 962 · C-undetermined 795 |
| Textintegrität | exact 5193 · review 1 · mismatch 1 |
| Normtyp | verwaltungsvorschrift 2389 · verordnung 2025 · gesetz 728 · zustimmungsgesetz 51 · verfassung 2 |

## 2 Sperrgründe (Dokumente je Grund)

| Grund | Dokumente |
| --- | --- |
| `parse:vwv-annex-document` | 437 |
| `parse:table-layout` | 422 |
| `transform:undecidable-source-state-abbreviation` | 350 |
| `parse:figure` | 271 |
| `transform:residual-source-state-reference` | 167 |
| `parse-units:table-layout` | 95 |
| `historical:unit-selection` | 44 |
| `parse:annex-separate-document` | 41 |
| `transform:organ-formula-conflict` | 30 |
| `parse:toc-unit-missing` | 18 |
| `parse:body-unit-not-in-toc` | 17 |
| `units-missing:changed-after-baseline` | 12 |
| `baseline:ledger-contradiction` | 7 |
| `schema:title-missing` | 4 |
| `parse:empty-footnote` | 3 |
| `baseline:undetermined` | 3 |
| `integrity:review` | 1 |
| `integrity:mismatch` | 1 |

`parse:table-layout` und `pdf-only`-Abbildungen gehen in den Review, weil der Textlayer Tabellen- und Bildinhalte nicht sicher trägt; `units-missing` heißt: Am Stichtag galt eine andere Fassung, die Einzelfassungen sind noch nicht (vollständig) im Cache (`npm run import:juris-sh:fetch-corpus -- --phase units`); `baseline:ledger-contradiction`: Das Ereignisregister belegt eine Änderung nach dem Stichtag, die Ausgabe nicht.

## 3 Zweite Quelle: amtliche Register

| Register | Bereich | Stand | Gl.Nr. im Register (Normen) | im Bestand | Abdeckung | ausgenommen (Änderungs-/Mantelgesetze, Tarifverträge) |
| --- | --- | --- | --- | --- | --- | --- |
| gvobl-systematische-uebersicht | landesrecht | 2024-12-13 | 897 | 869 | 96.9 % | 41 |
| ab-erlassverzeichnis | vwv | 2024-09-30 | 234 | 225 | 96.2 % | 12 |

**gvobl-systematische-uebersicht: im Register, in keinem enumerierten juris-Dokument (28)**

| Gl.Nr. | Titel laut Register |
| --- | --- |
| 188-3 | Gesetz zur Umsetzung des Verfassungsschutzauftrages zur Stärkung der nationalen Minderheiten und Volksgruppen |
| 2020-32 | Gesetz zur Schaffung eines Prüfungsrechtes des Landesrechnungshofes im Rahmen der Eingliederungshilfe |
| 2032-23 | Gesetz zur Förderung der personalwirtschaftlichen Bewältigung besonderer Bedarfslagen |
| 2183-1 | Gesetz über die durch innere Unruhen verursachten Schäden |
| 2186-21 | Gesetz zur institutionellen Förderung des Landesfeuerwehrverbandes |
| 301-12-1 | Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Änderung der Übereinkunft der Länder Freie Hansestadt Brem |
| 791-0-2 | Verordnung über das Naturschutzgebiet Hamburger Hallig, Kreis Nordfriesland |
| 791-0-3 | Verordnung über das Naturschutzgebiet „Tetenhusener Moor“, Kreis Schleswig |
| 791-0-4 | Verordnung über das „Naturschutzgebiet Kampener Vogelkoje auf Sylt“ |
| 791-3-10 | Verordnung über das „Naturschutzgebiet Reher Kratt“ in der Gemarkung Reher, Kreis Steinburg |
| 791-3-13 | Verordnung über das „Naturschutzgebiet Lütjenholmer Heidedünen“ in der Gemarkung Lütjenholm, Kreis Nordfriesland |
| 791-3-14 | Verordnung über das „Naturschutzgebiet Heidefläche bei Kellinghusen“ in der Gemarkung Vorbrügge, Kreis Steinburg |
| 791-3-16 | Verordnung zum Schutze von Landschaftsteilen in den Gemeinden Osterrade und Offenbüttel im Kreise Dithmarschen und der G |
| 791-3-17 | Verordnung über das „Naturschutzgebiet Vogelfreistätte Lebrader Teich“ in der Gemeinde Lebrade, Kreis Plön |
| 791-3-18 | Verordnung über das „Naturschutzgebiet Düne am Rimmelsberg“ in der Gemeinde Jörl, Kreis Flensburg-Land |
| 791-3-20 | Verordnung über das „Naturschutzgebiet Süderlügumer Binnendünen“ in der Gemarkung Süderlügum, Kreis Nordfriesland |
| 791-3-23 | Verordnung über das „Naturschutzgebiet Pobüller Bauernholz“ in den Gemeindebezirken Sollwitt im Kreise Nordfriesland und |
| 791-3-24 | Verordnung über das „Naturschutzgebiet Süderberge“ in der Gemarkung Süderlügum, Kreis Nordfriesland |
| 791-3-26 | Verordnung über das „Naturschutzgebiet Löwenstedter Sandberge“ in der Gemarkung Löwenstedt, Kreis Nordfriesland |
| 791-3-28 | Verordnung über das „Naturschutzgebiet Hechtmoor“ in der Gemarkung Dammholm, Kreis Schleswig |
| 791-3-29 | Verordnung über das „Naturschutzgebiet Gr. Wittenseer Moor“ in der Gemarkung Gr. Wittensee, Kreis Rendsburg-Eckernförde |
| 791-3-3 | Verordnung über das Naturschutzgebiet Nordspitze Amrum auf der Insel Amrum im Kreise Nordfriesland |
| 791-3-30 | Verordnung über das „Naturschutzgebiet Kaltenhofener Moor“ in den Gemarkungen Kaltenhof und Birkenmoor der Gemeinden Fel |
| 791-3-31 | Verordnung über das „Naturschutzgebiet Weißenhäuser Brök“ in der Gemarkung Weißenhaus, Kreis Ostholstein |
| 791-3-32 | Verordnung über das „Naturschutzgebiet Halloher Moor, Brandsheide und Könster Moor“ in der Gemarkung Großenaspe, Kreis S |
| 791-3-4 | Verordnung über das Naturschutzgebiet „Sorgwohld“ bei Sorgwohld, Kreis Rendsburg-Eckernförde |
| 791-4-233 | Landesverordnung über das Naturschutzgebiet „Goldenseeufer, Heidberg und Umgebung“ |
| B320-0-3 | Landesverordnung zur Übertragung personalrechtlicher Befugnisse in der Arbeitsgerichtsbarkeit |

**ab-erlassverzeichnis: im Register, in keinem enumerierten juris-Dokument (9)**

| Gl.Nr. | Titel laut Register |
| --- | --- |
| 2030.28 | Übertragung personalrechtlicher Befugnisse im Geschäftsbereich des Ministeriums für Justiz, Arbeit und Europa des Landes |
| 2034.43 | Bewertung der Personalunterkünfte für Angestellte und Arbeiter (Tarifverträge) |
| 2129.18 | Feststellung und Beurteilung von Geruchsimmissionen in Schleswig- Holstein (Geruchsimmissions-Richtlinie – GIRL -) |
| 2330.81 | Sonderprogramm „Neue Perspektive Wohnen“ – Förderrichtlinie 1 Wohnquartiere (NPW – F1) |
| 651.1 | Richtlinien für die Übernahme von Bürgschaften des Landes Schleswig- Holstein (Bürgschaftsrichtlinien) |
| 6600.31 | Richtlinie zur Vergabe der Finanzhilfe aus der Zusatz- Verwaltungsvereinbarung „Administration“ zum DigitalPakt Schule 2 |
| 6600.32 | Richtlinie zur Vergabe der Finanzhilfen aus dem DigitalPakt Schule 2019 bis 2024 an die Träger der Schulen der dänischen |
| 7910.6 | Verwaltungsvorschrift über Vollzugserleichterungen bei der Überwachung von Standorten, die nach der EG-Umweltaudit- Vero |
| 7914.3 | Ermittlung von Emissionen und Immissionen von luftverunreinigenden Stoffen, Geräuschen und Erschütterungen sowie Prüfung |


Die Register führen die zum Registerstand geltenden Vorschriften mit ihren Änderungen (Systematische Übersicht GVOBl., Erlassverzeichnis Amtsbl.). Eine fehlende Gliederungsnummer heißt: Die Vorschrift steht im Register, aber in keinem enumerierten juris-Dokument mit dieser Nummer (andere Schreibung, Sammelnummer, nicht in juris geführt oder nach dem Registerstand aufgehoben und entfernt).

## 4 baseline-only-Kandidaten des Ereignisregisters

54 Kandidaten (Vorschrift endete nach dem Stichtag), 49 einem juris-Dokument zugeordnet (Gliederungsnummer + Ausfertigungsdatum bzw. eindeutige Gliederungsnummer). Ausgänge: import-ready 28 · review 13 · reconstruction 6 · not-matched 5 · not-at-baseline 2.

| Ereignis | Datum | Gl.Nr. | Titel | juris | Ausgang |
| --- | --- | --- | --- | --- | --- |
| gvobl-systematische-uebersicht-p0052-l02 | 2023-12-19 | 2020-3-36 | Landesverordnung über die Aufstellung und Ausführung des Haushaltsplan | jlr-NNLSH00002AFF | import-ready |
| gvobl-systematische-uebersicht-p0050-l02 | 2023-12-31 | 2013-2-63 | Landesverordnung über Verwaltungsgebühren für Pflanzenschutzangelegenh | jlr-NNLSH00002FCD | review |
| gvobl-systematische-uebersicht-p0052-l03 | 2023-12-31 | 2020-3-37 | Landesverordnung über die Kassenführung der Gemeinden mit einer Hausha | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0052-l05 | 2023-12-31 | 2020-3-41 | Landesverordnung über die Aufstellung und Ausführung eines kameralen H | jlr-NNLSH00002DE1 | import-ready |
| gvobl-systematische-uebersicht-p0083-l04 | 2023-12-31 | 2120-22-1 | Landesverordnung zur Durchführung des Schleswig-Holsteinischen Rettung | jlr-NNLSH00003088 | review |
| gvobl-systematische-uebersicht-p0105-l00 | 2023-12-31 | 2131-2-7 | Landesverordnung über die Entschädigung der Wehrführungen der freiwill | jlr-NNLSH00002BCE | review |
| gvobl-systematische-uebersicht-p0273-l03 | 2023-12-31 | B 865-1-1 | Landesverordnung über Inhalte des Rahmenvertrags nach § 131 SGB IX zur | jlr-NNLSH00003283 | review |
| gvobl-systematische-uebersicht-p0066-l03 | 2024-01-31 | 2030-16-34 | Landesverordnung über die Laufbahn der Laufbahngruppe 2 in der Fachric | jlr-NNLSH00002D66 | review |
| gvobl-systematische-uebersicht-p0128-l04 | 2024-01-31 | 223-9-244 | Landesverordnung über die Arbeitszeit von Studienleiterinnen und Studi | – | nicht zugeordnet |
| gvobl-systematische-uebersicht-p0129-l00 | 2024-01-31 | 223-9-246 | Landesverordnung über die Arbeitszeit von Studienleitungen des Schlesw | jlr-NNLSH00002D63 | review |
| gvobl-systematische-uebersicht-p0156-l04 | 2024-02-26 | 301-11-4 | Landesverordnung über die Ausbildung der Juristinnen und Juristen (Jur | jlr-NNLSH00002F66 | import-ready |
| gvobl-systematische-uebersicht-p0066-l01 | 2024-04-04 | 2030-16-28 | Landesverordnung über die Laufbahn, Ausbildung und Prüfung der Laufbah | jlr-NNLSH00002D5C | reconstruction |
| gvobl-systematische-uebersicht-p0002-l01 | 2024-05-02 | 100-9 | Geschäftsordnung des Schleswig-Holsteinischen Landesverfassungsgericht | jlr-NNLSH00002D2F | reconstruction |
| gvobl-systematische-uebersicht-p0088-l03 | 2024-06-01 | 2122-10-1 | Landesverordnung über die Finanzierung der Pflegeberufeausbildung (Sch | jlr-NNLSH00003149 | review |
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
| gvobl-systematische-uebersicht-p0112-l04 | 2025-01-31 | 219-8-9 | Landesverordnung über die Vergütung der Öffentlich bestellten Vermessu | jlr-NNLSH00002BD1 | review |
| gvobl-systematische-uebersicht-p0101-l00 | 2025-02-28 | 2130-14-24 | Landesverordnung über die Überwachung von Tätigkeiten mit Bauprodukten | jlr-NNLSH0000300D | import-ready |
| gvobl-systematische-uebersicht-p0101-l01 | 2025-02-28 | 2130-14-25 | Landesverordnung über das Übereinstimmungszeichen (Übereinstimmungszei | jlr-NNLSH00003046 | import-ready |
| gvobl-systematische-uebersicht-p0175-l05 | 2025-05-07 | 630-2-1 | Landesverordnung über das Verfahren zur Bestimmung der Konjunkturkompo | jlr-NNLSH00003047 | import-ready |
| gvobl-systematische-uebersicht-p0045-l02 | 2025-05-30 | 2011-0-21 | Landesverordnung zur Abwehr von Gefahren für die öffentliche Sicherhei | jlr-NNLSH00002B66 | review |
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

