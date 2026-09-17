# Ereignisregister Schleswig-Holstein (Post-Baseline)

Erzeugt von `node scripts/import-juris-sh.ts events --write`. Schema `juris-sh-event-ledger/1`.
Stichtag **2023-12-01**; als Ereignis „nach dem Stichtag“ zählt ein Datum ab **2023-12-02**.
Auswertungsstichtag **2026-09-17** (Konstante, kein Tagesdatum – ein Wiederholungslauf erzeugt denselben Bericht).

Das Register enthält ausschließlich Belege aus den amtlichen Verkündungsblättern. Es erzeugt keinen Normtext
und trifft keine Entscheidung über die Geltung einer Vorschrift; es liefert die Belege, aus denen eine spätere
Stichtagsprüfung entscheidet.

## 1 Quellen

| Quelle | Stand | Seiten | sauber | versatzkorrigiert | unlesbar | SHA-256 (Anfang) |
| --- | --- | --- | --- | --- | --- | --- |
| Systematische Übersicht GVOBl. Schl.-H. (Register der geltenden Gesetze und Verordnungen) | 2024-12-13 | 283 | 283 | 0 | 0 | `2e75c53a82c2b987…` |
| Erlassverzeichnis Amtsbl. Schl.-H. (Register der geltenden Verwaltungsvorschriften) | 2024-09-30 | 109 | 109 | 0 | 0 | `4915b4712db5d3b3…` |
| Jahresinhaltsverzeichnis GVOBl. Schl.-H. 2023 | 2023-12-31 | 23 | 23 | 0 | 0 | `90aed1dfe6593dfc…` |
| Jahresinhaltsverzeichnis GVOBl. Schl.-H. 2024 | 2024-12-31 | 23 | 23 | 0 | 0 | `889946ce5469141a…` |
| Jahresinhaltsverzeichnis Amtsbl. Schl.-H. 2023 | 2023-12-31 | 36 | 36 | 0 | 0 | `c7894bb2b65468f0…` |
| Gesetz- und Verordnungsblatt für Schleswig-Holstein, Jahrgang 2023 | 2023-12-31 | 691 | 575 | 45 | 71 | `8a971d7662c94980…` |
| Gesetz- und Verordnungsblatt für Schleswig-Holstein, Jahrgang 2024 | 2024-12-31 | 975 | 888 | 30 | 57 | `98dec69331e1b773…` |
| Amtsblatt für Schleswig-Holstein, Jahrgang 2023 | 2023-12-31 | 3204 | 1472 | 1416 | 316 | `756f2747e27c10c1…` |

Adressen:
- `gvobl-systematische-uebersicht`: https://verkuendungsportal.schleswig-holstein.de/home/gvobl/gvobl-service/_documents/gvobl_service_systematische_uebersicht.pdf?__blob=publicationFile&v=2
- `ab-erlassverzeichnis`: https://verkuendungsportal.schleswig-holstein.de/home/amtsblatt/ab_service/ab_service_dokumente/ab_service_erlassverzeichnis.pdf?__blob=publicationFile&v=6
- `gvobl-jiv-2023`: https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2023/GVOBl_Jahresinhaltsverzeichnis_2023.pdf
- `gvobl-jiv-2024`: https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2024/I_Jahresinhaltsverzeichnis_2024.pdf
- `ab-jiv-2023`: https://verkuendungsportal.schleswig-holstein.de/mm/ab_jahrgang_2023/I_Jahresinhaltsverzeichnis_2023.pdf
- `gvobl-2023`: https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2023/GVOBl_2023.pdf
- `gvobl-2024`: https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2024/II_GVOBl_Jahrgang_2024
- `ab-2023`: https://verkuendungsportal.schleswig-holstein.de/mm/ab_jahrgang_2023/II_Amtsblatt_2023.pdf

## 2 Ereignisse

Gesamt: **5857**, davon mit Datum ab 2023-12-02: **528**.

| Ereignistyp | gesamt | ab 2023-12-02 |
| --- | --- | --- |
| `new` | 190 | 26 |
| `amend` | 4954 | 317 |
| `repeal` | 38 | 1 |
| `expire` | 184 | 109 |
| `recast` | 62 | 10 |
| `commencement` | 9 | 0 |
| `correction` | 35 | 0 |
| `publication-only` | 181 | 65 |
| `unknown` | 204 | 0 |

## 3 Evidenz und Verarbeitungsstand

| Beweisklasse | Anzahl |
| --- | --- |
| `strong` | 5085 |
| `supporting` | 387 |
| `insufficient` | 352 |
| `contradictory` | 33 |

| Verarbeitungsstand | Anzahl |
| --- | --- |
| `defused-by-entfristung` | 30 |
| `needs-review` | 148 |
| `recorded` | 5472 |
| `superseded-by-later-expiry` | 3 |
| `unparsed` | 204 |

Nicht zuordenbare Registerzeilen: **204** (als `unknown` mit Rohtext im Register geführt, nicht verworfen).
Entschärfte Außerkrafttreten (spätere Entfristung in derselben Normhistorie): **30**.
Ersetzte Außerkrafttreten (späteres Fristende derselben Vorschrift, verlängerte Befristung): **3**.

## 4 Baseline-only-Kandidaten

Vorschriften mit starkem Beleg für ein Ende (Aufhebung, Ersetzung, Ablauf) zwischen
2023-12-02 und 2026-09-17. Sie galten am Stichtag und fehlen im heutigen Bestand –
genau diese Vorschriften muss ein späterer Import zusätzlich beschaffen.

Anzahl: **54**.

| Datum | Typ | Gl.Nr. | Titel | Fundstelle |
| --- | --- | --- | --- | --- |
| 2023-12-19 | `repeal` | 2020-3-36 | Landesverordnung über die Aufstellung und Ausführung des Haushaltsplanes der Gemeinden (Gemeindehaushaltsveror | GVOBl. 2024 S. 75 |
| 2023-12-31 | `expire` | 2013-2-63 | Landesverordnung über Verwaltungsgebühren für Pflanzenschutzangelegenheiten | GVOBl. S. 841 |
| 2023-12-31 | `expire` | 2020-3-37 | Landesverordnung über die Kassenführung der Gemeinden mit einer Haushaltswirtschaft nach den Grundsätzen der k | GVOBl. S. 623 |
| 2023-12-31 | `expire` | 2020-3-41 | Landesverordnung über die Aufstellung und Ausführung eines kameralen Haushaltsplanes der Gemeinden (Gemeindeha | GVOBl. S. 623 |
| 2023-12-31 | `expire` | 2120-22-1 | Landesverordnung zur Durchführung des Schleswig-Holsteinischen Rettungsdienstgesetzes (SHRDG-DVO) | GVOBl. S. 830 |
| 2023-12-31 | `expire` | 2131-2-7 | Landesverordnung über die Entschädigung der Wehrführungen der freiwilligen Feuerwehren und ihrer Stellvertretu | GVOBl. S. 832 |
| 2023-12-31 | `expire` | B 865-1-1 | Landesverordnung über Inhalte des Rahmenvertrags nach § 131 SGB IX zur Erbringung von Leistungen der Eingliede | GVOBl. S. 1518 |
| 2024-01-31 | `expire` | 2030-16-34 | Landesverordnung über die Laufbahn der Laufbahngruppe 2 in der Fachrichtung Bildung (LVO-Bildung) | GVOBl. S. 32 |
| 2024-01-31 | `expire` | 223-9-244 | Landesverordnung über die Arbeitszeit von Studienleiterinnen und Studienleitern des Instituts für Qualitätsent | GVOBl. S. 26 |
| 2024-01-31 | `expire` | 223-9-246 | Landesverordnung über die Arbeitszeit von Studienleitungen des Schleswig- Holsteinischen Instituts für Berufli | GVOBl. S. 26 |
| 2024-02-26 | `expire` | 301-11-4 | Landesverordnung über die Ausbildung der Juristinnen und Juristen (Juristenausbildungsverordnung – JAVO) | GVOBl. S. 422 |
| 2024-04-04 | `expire` | 2030-16-28 | Landesverordnung über die Laufbahn, Ausbildung und Prüfung der Laufbahngrupupe 2, zweites Einstiegsamt, in der | GVOBl. S. 193 |
| 2024-05-02 | `expire` | 100-9 | Geschäftsordnung des Schleswig-Holsteinischen Landesverfassungsgerichts (GO - LVerfG) | GVOBl. S. 342 |
| 2024-06-01 | `expire` | 2122-10-1 | Landesverordnung über die Finanzierung der Pflegeberufeausbildung (Schleswig-Holsteinische Pflegeberufe-Finanz | GVOBl. S. 418 |
| 2024-06-06 | `expire` | 221-24-18 | Landesverordnung über die Übertragung von Bauaufgaben auf das Universitätsklinikum Schleswig-Holstein (UKSH) ( | GVOBl. S. 410 |
| 2024-06-06 | `expire` | 753-2-133 | Landesverordnung über die Selbstüberwachung von Abwasseranlagen und Abwassereinleitungen (Selbstüberwachungsve | GVOBl. S. 414 |
| 2024-06-30 | `expire` | 707-4-22 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Investitionsbank Schleswig-Holstein im Bereic | GVOBl. S. 287 |
| 2024-07-24 | `expire` | B 791-8-8 | Landesverordnung zur Abwendung von Schäden durch Kormorane | GVOBl. S. 217 |
| 2024-08-01 | `expire` | 200-0-385 | Landesverordnung über die Errichtung eines Prüfungsausschusses am Fachbereich Soziale Arbeit und Gesundheit an | GVOBl. S. 644 |
| 2024-09-29 | `expire` | 230-2-4 | Landesverordnung zur Festlegung der Zentralen Orte und Stadtrandkerne einschließlich ihrer Nah- und Mittelbere | GVOBl. S. 348 |
| 2024-11-01 | `expire` | 2126-12-4 | Landesverordnung zur Durchführung eines Mammographie-Screenings | GVOBl. S. 750 |
| 2024-12-31 | `expire` | 2120-14-5 | Landesverordnung über Gesundheitsberufe | GVOBl. S. 641 |
| 2024-12-31 | `expire` | 2120-23-1 | Landesverordnung über die Festsetzung der pauschalen Förderung nach § 20 Absatz 4 des Landeskrankenhausgesetze | GVOBl. S. 341 |
| 2024-12-31 | `expire` | B 2122-10-2 | Landesverordnung über die Ausbildung und Durchführung der Pflegeberufeausbildung (Pflegeberufe-Ausbildungs- Du | GVOBl. S. 23 |
| 2024-12-31 | `expire` | 2130-14-22 | Landesverordnung über Anforderungen an Herstellerinnen und Hersteller von Bauprodukten und Anwenderinnen und A | GVOBl. S. 748 |
| 2024-12-31 | `expire` | 2130-14-23 | Landesverordnung über die Anerkennung als Prüf-, Überwachungs- oder Zertifizierungsstelle nach Bauordnungsrech | GVOBl. S. 749 |
| 2024-12-31 | `expire` | 2186-25-1 | Landesverordnung über Zweckabgaben für in öffentlicher Trägerschaft veranstaltete Lotterien (LottZwAbgVO) | GVOBl. S. 841 |
| 2024-12-31 | `expire` | 707-4-18 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Investitionsbank Schleswig-Holstein im Bereic | GVOBl. S. 649 |
| 2024-12-31 | `expire` | B 850-1-2 | Landesverordnung über das Verfahren der Evaluation nach dem Kindertagesförderungsgesetz (Kita-Evaluationsveror | GVOBl. S. 15 |
| 2024-12-31 | `expire` | 90-1-13 | Landesverordnung über die Kostentragung bei der Verwaltung von Kreisstraßen durch das Land | GVOBl. S. 140 |
| 2025-01-31 | `expire` | 2013-2-69 | Landesverordnung über Gebühren des Landesamtes für Vermessung und Geoinformation Schleswig-Holstein (VermGebVO | GVOBl. S. 817 |
| 2025-01-31 | `expire` | 2124-3-7 | Landesverordnung über die Vergütung für Leistungen der Hebammen und Entbindungspfleger gegenüber Selbstzahleri | GVOBl. S. 134 |
| 2025-01-31 | `expire` | 219-8-9 | Landesverordnung über die Vergütung der Öffentlich bestellten Vermessungsingenieurinnen und Öffentlich bestell | GVOBl. S. 829 |
| 2025-02-28 | `expire` | 2130-14-24 | Landesverordnung über die Überwachung von Tätigkeiten mit Bauprodukten und bei Bauarten (ÜTVO) | GVOBl. S. 20 |
| 2025-02-28 | `expire` | 2130-14-25 | Landesverordnung über das Übereinstimmungszeichen (Übereinstimmungszeichen-Verordnung - ÜZVO) | GVOBl. S. 17 |
| 2025-05-07 | `expire` | 630-2-1 | Landesverordnung über das Verfahren zur Bestimmung der Konjunkturkomponente nach § 5 des Gesetzes zur Ausführu | GVOBl. S. 210 |
| 2025-05-30 | `expire` | 2011-0-21 | Landesverordnung zur Abwehr von Gefahren für die öffentliche Sicherheit durch Kampfmittel (Kampfmittelverordnu | GVOBl. S. 607 |
| 2025-06-25 | `expire` | 7220-4-3 | Landesverordnung zur Feststellung der repräsentativen Tarifverträge im Bereich des öffentlichen Personenverkeh | GVOBl. S. 305 |
| 2025-06-29 | `expire` | 224-11-1 | Landesverordnung über den Denkmalrat (Denkmalratsverordnung) | GVOBl. S. 299 |
| 2025-06-29 | `expire` | 224-11-2 | Landesverordnung über die Vertrauensleute für Kulturdenkmale | GVOBl. S. 300 |
| 2025-06-29 | `expire` | 224-11-3 | Landesverordnung über die Einführung des Zustimmungsvorbehalts bei Genehmigungsverfahren betreffend archäologi | GVOBl. S. 300 |
| 2025-06-29 | `expire` | 224-11-4 | Landesverordnung über die Einführung des Zustimmungsvorbehalts bei Genehmigungsverfahren betreffend Gründenkma | GVOBl. S. 301 |
| 2025-06-29 | `expire` | 224-11-5 | Landesverordnung über das Verfahren zur Ausweisung von Denkmalbereichen und Grabungsschutzgebieten | GVOBl. S. 301 |
| 2025-06-29 | `expire` | 224-11-6 | Landesverordnung über die Denkmallisten für Kulturdenkmale | GVOBl. S. 302 |
| 2025-06-30 | `expire` | 707-4-23 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Investitionsbank Schleswig-Holstein im Bereic | GVOBl. S. 465 |
| 2025-07-09 | `expire` | 204-5-3 | Landesverordnung über die zentrale Stelle für ressortübergreifende Personalmanagementverfahren | GVOBl. S. 379 |
| 2025-08-26 | `expire` | 2031-3-3 | Landesverordnung über Dienstvorgesetzte der Polizei nach dem Landesdisziplinargesetz | GVOBl. S. 492 |
| 2025-08-30 | `expire` | 2013-2-65 | Landesverordnung über Verwaltungsgebühren in Angelegenheiten der Lebensmittel- und Bedarfsgegenständeüberwachu | GVOBl. S. 471 |
| 2025-10-28 | `expire` | 114-0-4 | Landesverordnung über die örtliche Bekanntmachung und Verkündung (Bekanntmachungsverordnung - BekanntVO) | GVOBl. S. 573 |
| 2025-12-31 | `expire` | 780-3-31 | Landesverordnung über die Wahl der Hauptversammlung der Landwirtschaftskammer Schleswig-Holstein (Wahlordnung  | GVOBl. S. 538 |
| 2025-12-31 | `expire` | B 850-1-3 | Landesverordnung über die Personalqualifikation in öffentlich geförderten Kindertageseinrichtungen (Personalqu | GVOBl. S. 851 |
| 2025-12-31 | `expire` | 90-1-14 | Landesverordnung über die Kostentragung bei der Verwaltung von Kreisstraßen durch das Land | GVOBl. S. 852 |
| 2026-02-19 | `expire` | 12-3-2 | Landesverordnung zur Feststellung der lebenswichtigen Einrichtungen im Sinne des § 2 Absatz 2 des Landessicher | GVOBl. S. 263 |
| 2026-06-10 | `expire` | B 864-8-16 | Landesverordnung über die Freistellung für ehrenamtliche Mitarbeit in der Jugendarbeit (Freistellungsverordnun | GVOBl. S. 646 |

Zusätzlich **18** Vorschriften mit einem erst nach dem 2026-09-17 wirkenden Ende (künftige Befristung).
Auch sie galten am Stichtag; sie gelten aber weiterhin und sind deshalb keine baseline-only-Kandidaten.

Nicht gezählt sind **2** Teilaufhebungen und Teilaußerkrafttreten ab 2023-12-02
(z. B. „§ 251 Abs. 4 … außer Kraft 19.3.2024“). Sie beweisen das Gegenteil eines Endes: Die Vorschrift bestand
zu diesem Zeitpunkt im Übrigen fort und galt damit auch am Stichtag.

## 5 Dezember 2023 – die kritische Zone um den Stichtag

Maßgeblich ist das **Ausgabedatum des Blattes**, nicht das Ausfertigungs- oder Entscheidungsdatum.

| Organ | Ausgabe | ausgegeben | gedruckte Seiten |
| --- | --- | --- | --- |
| GVOBl. | 16 | 2023-12-07 | 540–632 |
| Amtsbl. | 49/50 | 2023-12-11 | 2692–2936 |
| Amtsbl. | 51 | 2023-12-18 | 2938–2978 |
| Amtsbl. | 52 | 2023-12-27 | 2980–3111 |
| GVOBl. | 17 | 2023-12-28 | 634–648 |

In diesen Ausgaben verkündet: **57** Veröffentlichungen mit Eintrag im Jahresinhaltsverzeichnis.
Davon ändern **27** eine namentlich benannte Vorschrift – diese Vorschriften galten am Stichtag.
**43** wurden vor dem Stichtag ausgefertigt bzw. entschieden, aber erst danach verkündet: Sie galten am 2023-12-01 **noch nicht**.

| verkündet | Ausgabe | Datum der Entscheidung | vor Stichtag ausgefertigt | ändert | Titel | Fundstelle |
| --- | --- | --- | --- | --- | --- | --- |
| 2023-12-07 | GVOBl. 16 | 2023-11-08 | ja | 2031-3 | Gesetz zur Änderung des Landesdisziplinargesetzes | GVOBl. Schl.-H. 2023 S. 541 |
| 2023-12-07 | GVOBl. 16 | 2023-11-08 | ja | B 315-20-11 | Landesverordnung zur Änderung der Landesverordnung über die elektronische Akten- führung i | GVOBl. Schl.-H. 2023 S. 542 |
| 2023-12-07 | GVOBl. 16 | 2023-11-27 | ja | – | Gesetz zur Aufhebung des Gesetzes zur Durchführung der Kriegsopferfürsorge | GVOBl. Schl.-H. 2023 S. 542 |
| 2023-12-07 | GVOBl. 16 | 2023-11-14 | ja | B 2170-2-1 | Landesverordnung zur Änderung der SbStG-Durchführungsverordnung | GVOBl. Schl.-H. 2023 S. 544 |
| 2023-12-07 | GVOBl. 16 | 2023-11-14 | ja | 2035-3-10 | Landesverordnung zur Änderung von Landesverordnungen nach dem Mitbestimmungsgesetz | GVOBl. Schl.-H. 2023 S. 545 |
| 2023-12-07 | GVOBl. 16 | 2023-11-14 | ja | 300-19-1 | Landesverordnung zur Änderung der Justizzuständigkeitsverordnung | GVOBl. Schl.-H. 2023 S. 545 |
| 2023-12-07 | GVOBl. 16 | 2023-11-15 | ja | B 200-0-40 | Landesverordnung zur Änderung der Finanzämter-Zuständigkeitsverordnung | GVOBl. Schl.-H. 2023 S. 546 |
| 2023-12-07 | GVOBl. 16 | 2023-11-15 | ja | B 315-20-6 | Landesverordnung zur Einführung des amtsgerichtlichen Gesellschaftsregisters und zur Änder | GVOBl. Schl.-H. 2023 S. 552 |
| 2023-12-07 | GVOBl. 16 | 2023-11-16 | ja | B 605-0-2 | Landesverordnung zur Änderung der Landesverordnung über die Aufteilung und Aus- zahlung de | GVOBl. Schl.-H. 2023 S. 555 |
| 2023-12-07 | GVOBl. 16 | 2023-11-16 | ja | B 611-0-7 | Landesverordnung zur Änderung der Landesverordnung über die Aufteilung und Auszahlung des  | GVOBl. Schl.-H. 2023 S. 587 |
| 2023-12-07 | GVOBl. 16 | 2023-11-17 | ja | – | Landesverordnung zur Änderung der Landesverordnung über Verwaltungsgebühren für das Landes | GVOBl. Schl.-H. 2023 S. 619 |
| 2023-12-07 | GVOBl. 16 | 2023-11-21 | ja | 7220-4-2 | Landesverordnung zur Änderung der Schleswig-Holsteinischen Vergabeverordnung und Aufhebung | GVOBl. Schl.-H. 2023 S. 620 |
| 2023-12-07 | GVOBl. 16 | 2023-11-23 | ja | 780-3-30 | Landesverordnung zur Änderung der Umlageverordnung | GVOBl. Schl.-H. 2023 S. 622 |
| 2023-12-07 | GVOBl. 16 | 2023-11-23 | ja | 2013-2-65 | Landesverordnung zur Änderung der Landesverordnung über Verwaltungsgebühren in An- gelegen | GVOBl. Schl.-H. 2023 S. 623 |
| 2023-12-07 | GVOBl. 16 | 2023-11-24 | ja | 793-4-11 | Landesverordnung zur Änderung der Küstenfischereiverordnung | GVOBl. Schl.-H. 2023 S. 624 |
| 2023-12-07 | GVOBl. 16 | 2023-11-27 | ja | – | Landesverordnung zur Durchführung des Schleswig-Holsteinischen Rettungsdienst- gesetzes (S | GVOBl. Schl.-H. 2023 S. 624 |
| 2023-12-07 | GVOBl. 16 | 2023-11-27 | ja | 2020-3-36 | Landesverordnung zur Änderung der Gemeindehaushaltsverordnung-Doppik | GVOBl. Schl.-H. 2023 S. 631 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-01-23 | ja | – | Vertretung des Landes Schleswig-Holstein im Geschäftsbereich des Ministeriums für Landwirt | Amtsbl. Schl.-H. 2023 S. 2709 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-09-21 | ja | – | Neufassung der Richtlinie zur Förderung der Breitbandversorgung in den ländlichen Räumen S | Amtsbl. Schl.-H. 2023 S. 2717 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-10-19 | ja | 6600.43 | Änderung der Richtlinie des Landes Schleswig-Holstein für die Förderung einzelbetriebliche | Amtsbl. Schl.-H. 2023 S. 2725 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-01 | ja | – | Richtlinie „Korruptionsprävention und Korruptionsbekämpfung in der Landes- verwaltung Schl | Amtsbl. Schl.-H. 2023 S. 2727 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-08 | ja | – | Aufhebung des Erlasses „Soziale Wohnraumförderung in Schleswig-Holstein – Forderungskauf u | Amtsbl. Schl.-H. 2023 S. 2757 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-09 | ja | 6600.45 | Änderung Richtlinie über die Förderung zusätzlich erforderlicher Beratungsan- gebote der k | Amtsbl. Schl.-H. 2023 S. 2758 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-10 | ja | – | Verwaltungsvorschriften über den Kontenrahmen für die Haushalte der Ge- meinden (VV-Konten | Amtsbl. Schl.-H. 2023 S. 2759 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-10 | ja | – | Ausführungsanweisung zur Gemeindehaushaltsverordnung über die Aufstellung und Ausführung e | Amtsbl. Schl.-H. 2023 S. 2840 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-14 | ja | – | Weitergeltung von Rechtsvorschriften über den 11. Dezember 2023 hinaus bis zum 11. Dezembe | Amtsbl. Schl.-H. 2023 S. 2902 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-14 | ja | – | Richtlinie zur Förderung von Beratungsstellen von männlichen Opfern häusli- cher oder sexu | Amtsbl. Schl.-H. 2023 S. 2903 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-15 | ja | – | Dienstausweise für Mitglieder der Freiwilligen Feuerwehren | Amtsbl. Schl.-H. 2023 S. 2909 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-16 | ja | 2135.48 | Änderung der Dienstkleidungsvorschrift für Mitarbeiterinnen und Mitarbeiter des Landes Sch | Amtsbl. Schl.-H. 2023 S. 2911 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-11-20 | ja | – | Vertretung des Landes Schleswig-Holstein bei gerichtlichen Rechtsstreitigkei- ten im Gesch | Amtsbl. Schl.-H. 2023 S. 2912 |
| 2023-12-11 | Amtsbl. 49/50 | 2023-12-04 | nein | – | Weitergeltung von Verwaltungsvorschriften über den 31. Dezember 2023 hinaus bis zum 31. De | Amtsbl. Schl.-H. 2023 S. 2917 |
| 2023-12-18 | Amtsbl. 51 | 2023-09-26 | ja | – | Richtlinie des Landes Schleswig-Holstein über die Anerkennung und Förderung der Beratungss | Amtsbl. Schl.-H. 2023 S. 2939 |
| 2023-12-18 | Amtsbl. 51 | 2023-11-16 | ja | 2330.92 | Soziale Wohnraumförderung in Schleswig-Holstein – Änderung der Wohn- raumförderungsrichtli | Amtsbl. Schl.-H. 2023 S. 2944 |
| 2023-12-18 | Amtsbl. 51 | 2023-11-16 | ja | 2330.93 | Änderung der Förderrichtlinie zum Sonderprogramm „Wohnraum für beson- dere Bedarfsgruppen“ | Amtsbl. Schl.-H. 2023 S. 2946 |
| 2023-12-18 | Amtsbl. 51 | 2023-11-20 | ja | – | Weitergeltung von Verwaltungsvorschriften über den 31. Dezember 2023 hinaus bis zum 31. De | Amtsbl. Schl.-H. 2023 S. 2948 |
| 2023-12-18 | Amtsbl. 51 | 2023-11-21 | ja | – | Neufassung der Richtlinie des Ministeriums für Wirtschaft, Verkehr, Arbeit, Technologie un | Amtsbl. Schl.-H. 2023 S. 2949 |
| 2023-12-18 | Amtsbl. 51 | 2023-11-22 | ja | 6603.22 | Änderung der Richtlinie des Landes Schleswig-Holstein für die Gewährung von Zuwendungen zu | Amtsbl. Schl.-H. 2023 S. 2961 |
| 2023-12-18 | Amtsbl. 51 | 2023-11-24 | ja | – | Richtlinie für die Vergabe von Zuwendungen aus dem Sondervermögen Ener- gie- und Wärmewend | Amtsbl. Schl.-H. 2023 S. 2962 |
| 2023-12-27 | Amtsbl. 52 | 2023-11-01 | ja | – | Krankenhausplan für das Land Schleswig-Holstein - Weitergeltung der Befris- tung bis zum 3 | Amtsbl. Schl.-H. 2023 S. 2990 |
| 2023-12-27 | Amtsbl. 52 | 2023-11-18 | ja | – | Richtlinie zur Gewährung von Fehlbetrags- und Sonderbedarfszuweisungen (§§ 17 und 18 FAG) | Amtsbl. Schl.-H. 2023 S. 2991 |
| 2023-12-27 | Amtsbl. 52 | 2023-11-22 | ja | – | Richtlinie für die Förderung der Kinder- und Jugendtelefone sowie der Elterntelefone | Amtsbl. Schl.-H. 2023 S. 2996 |
| 2023-12-27 | Amtsbl. 52 | 2023-11-30 | ja | 6602.19 | Änderung der Richtlinie des Landes Schleswig-Holstein zur Förderung von Digitalisierungsma | Amtsbl. Schl.-H. 2023 S. 3000 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-01 | ja | – | Richtlinie des Landes Schleswig-Holstein für die Gewährung von Zuwendungen zur Förderung v | Amtsbl. Schl.-H. 2023 S. 3002 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-01 | ja | – | Pflegegeld in der Jugendhilfe – Festsetzung der Pauschalbeträge für laufende Leistungen zu | Amtsbl. Schl.-H. 2023 S. 3018 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-04 | nein | – | Richtlinie des Landes Schleswig-Holstein für die die Gewährung von Zuwen- dungen zur Förde | Amtsbl. Schl.-H. 2023 S. 3020 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-04 | nein | – | Richtlinie des Landes Schleswig-Holstein für die Gewährung von Zuwendungen zur Einstiegsfö | Amtsbl. Schl.-H. 2023 S. 3041 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-04 | nein | – | Vereinbarung mit den Spitzenorganisationen der Gewerkschaften nach § 59 des Mitbestimmungs | Amtsbl. Schl.-H. 2023 S. 3054 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-04 | nein | – | Vereinbarung mit den Spitzenorganisationen der Gewerkschaften nach § 59 des Mitbestimmungs | Amtsbl. Schl.-H. 2023 S. 3063 |
| 2023-12-27 | Amtsbl. 52 | 2023-12-04 | nein | – | Vereinbarung mit den Spitzenorganisationen der Gewerkschaften nach § 59 des Mitbestimmungs | Amtsbl. Schl.-H. 2023 S. 3065 |
| 2023-12-28 | GVOBl. 17 | 2023-12-13 | nein | 2032-20 | Gesetz zur Fortentwicklung dienstrechtlicher Vorschriften | GVOBl. Schl.-H. 2023 S. 634 |
| 2023-12-28 | GVOBl. 17 | 2023-12-14 | nein | 1101-9 | Gesetz zur Änderung des Gesetzes über die Rechtsstellung und Finanzierung der Fraktionen i | GVOBl. Schl.-H. 2023 S. 637 |
| 2023-12-28 | GVOBl. 17 | 2023-12-14 | nein | ja | Gesetz zur Änderung des Landesverwaltungsgesetzes | GVOBl. Schl.-H. 2023 S. 638 |
| 2023-12-28 | GVOBl. 17 | 2023-12-14 | nein | – | Gesetz über die Errichtung eines Sondervermögens „Wiederaufbaufonds Flutkatastro- phe 2023 | GVOBl. Schl.-H. 2023 S. 642 |
| 2023-12-28 | GVOBl. 17 | 2023-12-14 | nein | B 850-1 | Gesetz zur Änderung des Kindertagesförderungsgesetzes | GVOBl. Schl.-H. 2023 S. 643 |
| 2023-12-28 | GVOBl. 17 | 2023-12-15 | nein | – | Zweites Gesetz zur Änderung des Gesetzes über die Feststellung eines Haushaltsplanes für d | GVOBl. Schl.-H. 2023 S. 644 |
| 2023-12-28 | GVOBl. 17 | 2023-12-15 | nein | 2032-20 | Gesetz über Sonderzahlungen aus Anlass der gestiegenen Verbraucherpreise | GVOBl. Schl.-H. 2023 S. 645 |
| 2023-12-28 | GVOBl. 17 | 2023-12-18 | nein | 867-2 | Gesetz zur Änderung des Gesetzes zur Ausführung des Neunten Buches Sozialgesetzbuch | GVOBl. Schl.-H. 2023 S. 647 |

### Jahrgangswechsel

**4** Ausfertigungen aus November/Dezember 2023 sind erst im Folgejahrgang verkündet worden.
Sie galten am Stichtag nicht, obwohl ihr Ausfertigungsdatum davor liegt.

| verkündet | Ausgabe | ausgefertigt | Titel | Fundstelle |
| --- | --- | --- | --- | --- |
| 2024-01-25 | GVOBl. 1 | 2023-11-20 | Landesverordnung über die Ausbildung und Prüfung zur staatlich anerkannten Desinfektorin und zum sta | GVOBl. Schl.-H. 2024 S. 4 |
| 2024-01-25 | GVOBl. 1 | 2023-12-05 | Landesverordnung über die Ordnung des Vorbereitungsdienstes und die Staatsprüfungen der Lehrkräfte ( | GVOBl. Schl.-H. 2024 S. 14 |
| 2024-01-25 | GVOBl. 1 | 2023-12-05 | Landesverordnung über die Arbeitszeit von Studienleitungen des Instituts für Qualitätsentwicklung an | GVOBl. Schl.-H. 2024 S. 26 |
| 2024-01-25 | GVOBl. 1 | 2023-12-13 | Landesverordnung über die Prüfung technischer Anlagen nach dem Bauordnungsrecht (Prüfverordnung – Pr | GVOBl. Schl.-H. 2024 S. 29 |

### Kollektive Weitergeltung

Sammelbekanntmachungen „Weitergeltung von Verwaltungsvorschriften über den 31. Dezember … hinaus“, wie das
Erlassverzeichnis sie bei den einzelnen Vorschriften vermerkt. Jeder Vermerk belegt, dass die betroffene
Verwaltungsvorschrift am Stichtag galt und darüber hinaus weitergilt.

| Bek. vom | Fundstelle | betroffene Verwaltungsvorschriften |
| --- | --- | --- |
| 2023-11-01 | Amtsbl. Schl.-H. S. 2667 | 9 |
| 2023-11-01 | Amtsbl. Schl.-H. S. 2668 | 2 |
| 2023-11-01 | Amtsbl. Schl.-H. S. 2669 | 1 |
| 2023-11-01 | Amtsbl. Schl.-H. S. 2990 | 1 |
| 2023-11-03 | – | 2 |
| 2023-11-03 | Amtsbl. Schl.-H. S. 2683 | 2 |
| 2023-12-04 | Amtsbl. Schl.-H. S. 3105 | 1 |
| 2023-12-19 | Amtsbl. Schl.-H. 2024 S. 86 | 2 |

## 6 Inventar der Verwaltungsvorschriften

Das Erlassverzeichnis (Stand 2024-09-30) führt **846** Verwaltungsvorschriften mit eindeutiger Gliederungsnummer;
bei **246** davon ist mindestens ein Ereignis vermerkt. Inventar: `data/imports/juris-sh/events/vwv-inventory.json`.

## 7 Grenzen

- Beide Register führen nur den **geltenden** Bestand und datieren **nach** dem Stichtag (Systematische Übersicht Ende 2024, Erlassverzeichnis 30.09.2024). Zwischen 2023-12-01 und dem Registerstand aufgehobene Vorschriften fehlen dort und sind nur aus den Verkündungsblättern zu gewinnen.
- Für das GVOBl. ab 2025 gibt es keinen robots-konform erreichbaren Index (Fundstellennachweis „noch nicht verfügbar“, Portalsuche und Sitemap-Teildateien gesperrt). Ereignisse ab 2025 stehen hier nur, soweit die Register sie führen.
- Nachrichtenblatt Schule und Hochschul-Nachrichtenblatt sind eigenständige Verkündungsorgane und in diesem Register **nicht** enthalten.
- Das Justizministerialblatt Teil B ist per robots.txt für automatisierte Abrufe gesperrt und bleibt unerhoben.
- Die Archiv-PDFs sind amtliche Informationskopien, nicht die maßgebliche gedruckte Ausgabe.

