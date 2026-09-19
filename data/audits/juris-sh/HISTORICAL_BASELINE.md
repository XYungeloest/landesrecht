# Historische Baseline juris Schleswig-Holstein

Erzeugt von `node scripts/import-juris-sh.ts reconstruction-queue --write`. Stichtag **2023-12-01**. Quelle: Bürgerservice Schleswig-Holstein (juris), Simulationsland Niedersachsen-Holstein (`nsh`).

## 1 Stichtagsklassifikation

Je Dokument aus der öffentlichen PDF-Ausgabe (Kopf „Gültig ab/bis“, Ausgabevermerk, „Stand: letzte berücksichtigte Änderung“, Gültigkeit jeder Einheit im Verzeichnis); Quelle `data/audits/juris-sh/corpus-inventory.json`.

| Bereich | unchanged-since-baseline | changed-after-baseline | repealed-after-baseline | enacted-after-baseline | repealed-before-baseline | undetermined |
| --- | --- | --- | --- | --- | --- | --- |
| landesrecht | 1283 | 250 | 88 | 153 | 962 | 72 |
| vwv | 1766 | 12 | 0 | 608 | 0 | 3 |

`undetermined` (→ Review): sonstige 72 · nicht im Cache 2 · Ausgabe ohne Normtext 1

Historische Fassungen: Stichtagsfassungen aus den am Stichtag geltenden Einzelfassungen der juris-Historie (PDF-Ausgabe „genau dieses Dokument“) zusammengesetzt und übernahmefähig: 289; zusammengesetzt, aber aus anderen Gründen im Review: 84. Der heutige Text ersetzt nie die Stichtagsfassung.

Rangfolge für jede Stichtagsfassung (unverändert): 1. öffentlich erreichbare historische juris-Fassung (Einzelfassungen „genau dieses Dokument“ mit Gültigkeitszeitraum) · 2. amtliche vollständige Veröffentlichung · 3. sichere Rekonstruktion · 4. Review. Der heutige Text ersetzt nie die Stichtagsfassung.

## 2 Ereignisregister (bestehend, weiterverwendet)

Ereignisse gesamt 5857, davon nach dem Stichtag 528. Zuordnung Ereignis → DOKNR über Verkündungsblatt + Gliederungsnummer + Ausfertigungsdatum der Zielnorm (bzw. eindeutige Gliederungsnummer); zugeordnete Ereignisse gehen als Belege in die Stichtagsprüfung (Regeln A/B/C), ein Widerspruch zur Ausgabe führt in den Review.

## 3 baseline-only-Kandidaten

Register (Systematische Übersicht) Stand 2024-12-13. Kandidaten **54**: Dubletten 0 · Ende vor dem Registerstand (durch das Register belegt) 21 · Ende nach dem Registerstand (nur angekündigt, Entfristung nicht ausschließbar) 33 · einem juris-Dokument zugeordnet 49 · Stichtagsfassung übernahmefähig 34.

Zugeordnete Kandidaten sind in juris als nach dem Stichtag aufgehobene Normen geführt; ihre Stichtagsfassung entsteht aus den Einzelfassungen (sonst Review). Nicht zugeordnete stehen in der Rekonstruktionsqueue.

| Ende | Typ | Gl.Nr. | Titel | Fundstelle | Einordnung | juris | Ausgang |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2023-12-19 | repeal | 2020-3-36 | Landesverordnung über die Aufstellung und Ausführung des Haushaltsplanes der Gemeinden (Gemeindehaus | GVOBl. 2024 S. 75 | confirmed-by-register | jlr-NNLSH00002AFF | import-ready |
| 2023-12-31 | expire | 2013-2-63 | Landesverordnung über Verwaltungsgebühren für Pflanzenschutzangelegenheiten | GVOBl. S. 841 | confirmed-by-register | jlr-NNLSH00002FCD | review |
| 2023-12-31 | expire | 2020-3-37 | Landesverordnung über die Kassenführung der Gemeinden mit einer Haushaltswirtschaft nach den Grundsä | GVOBl. S. 623 | confirmed-by-register | – | – |
| 2023-12-31 | expire | 2020-3-41 | Landesverordnung über die Aufstellung und Ausführung eines kameralen Haushaltsplanes der Gemeinden ( | GVOBl. S. 623 | confirmed-by-register | jlr-NNLSH00002DE1 | import-ready |
| 2023-12-31 | expire | 2120-22-1 | Landesverordnung zur Durchführung des Schleswig-Holsteinischen Rettungsdienstgesetzes (SHRDG-DVO) | GVOBl. S. 830 | confirmed-by-register | jlr-NNLSH00003088 | review |
| 2023-12-31 | expire | 2131-2-7 | Landesverordnung über die Entschädigung der Wehrführungen der freiwilligen Feuerwehren und ihrer Ste | GVOBl. S. 832 | confirmed-by-register | jlr-NNLSH00002BCE | import-ready |
| 2023-12-31 | expire | B 865-1-1 | Landesverordnung über Inhalte des Rahmenvertrags nach § 131 SGB IX zur Erbringung von Leistungen der | GVOBl. S. 1518 | confirmed-by-register | jlr-NNLSH00003283 | review |
| 2024-01-31 | expire | 2030-16-34 | Landesverordnung über die Laufbahn der Laufbahngruppe 2 in der Fachrichtung Bildung (LVO-Bildung) | GVOBl. S. 32 | confirmed-by-register | jlr-NNLSH00002D66 | import-ready |
| 2024-01-31 | expire | 223-9-244 | Landesverordnung über die Arbeitszeit von Studienleiterinnen und Studienleitern des Instituts für Qu | GVOBl. S. 26 | confirmed-by-register | – | – |
| 2024-01-31 | expire | 223-9-246 | Landesverordnung über die Arbeitszeit von Studienleitungen des Schleswig- Holsteinischen Instituts f | GVOBl. S. 26 | confirmed-by-register | jlr-NNLSH00002D63 | import-ready |
| 2024-02-26 | expire | 301-11-4 | Landesverordnung über die Ausbildung der Juristinnen und Juristen (Juristenausbildungsverordnung – J | GVOBl. S. 422 | confirmed-by-register | jlr-NNLSH00002F66 | import-ready |
| 2024-04-04 | expire | 2030-16-28 | Landesverordnung über die Laufbahn, Ausbildung und Prüfung der Laufbahngrupupe 2, zweites Einstiegsa | GVOBl. S. 193 | confirmed-by-register | jlr-NNLSH00002D5C | reconstruction |
| 2024-05-02 | expire | 100-9 | Geschäftsordnung des Schleswig-Holsteinischen Landesverfassungsgerichts (GO - LVerfG) | GVOBl. S. 342 | confirmed-by-register | jlr-NNLSH00002D2F | reconstruction |
| 2024-06-01 | expire | 2122-10-1 | Landesverordnung über die Finanzierung der Pflegeberufeausbildung (Schleswig-Holsteinische Pflegeber | GVOBl. S. 418 | confirmed-by-register | jlr-NNLSH00003149 | import-ready |
| 2024-06-06 | expire | 221-24-18 | Landesverordnung über die Übertragung von Bauaufgaben auf das Universitätsklinikum Schleswig-Holstei | GVOBl. S. 410 | confirmed-by-register | jlr-NNLSH00002D16 | reconstruction |
| 2024-06-06 | expire | 753-2-133 | Landesverordnung über die Selbstüberwachung von Abwasseranlagen und Abwassereinleitungen (Selbstüber | GVOBl. S. 414 | confirmed-by-register | jlr-NNLSH00002D19 | reconstruction |
| 2024-06-30 | expire | 707-4-22 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Investitionsbank Schleswig-Holstein | GVOBl. S. 287 | confirmed-by-register | jlr-NNLSH0000327F | import-ready |
| 2024-07-24 | expire | B 791-8-8 | Landesverordnung zur Abwendung von Schäden durch Kormorane | GVOBl. S. 217 | confirmed-by-register | – | – |
| 2024-08-01 | expire | 200-0-385 | Landesverordnung über die Errichtung eines Prüfungsausschusses am Fachbereich Soziale Arbeit und Ges | GVOBl. S. 644 | confirmed-by-register | jlr-NNLSH00002D46 | import-ready |
| 2024-09-29 | expire | 230-2-4 | Landesverordnung zur Festlegung der Zentralen Orte und Stadtrandkerne einschließlich ihrer Nah- und  | GVOBl. S. 348 | confirmed-by-register | jlr-NNLSH00002D3F | review |
| 2024-11-01 | expire | 2126-12-4 | Landesverordnung zur Durchführung eines Mammographie-Screenings | GVOBl. S. 750 | confirmed-by-register | jlr-NNLSH00002D33 | import-ready |
| 2024-12-31 | expire | 2120-14-5 | Landesverordnung über Gesundheitsberufe | GVOBl. S. 641 | announced-only | jlr-NNLSH0000305E | import-ready |
| 2024-12-31 | expire | 2120-23-1 | Landesverordnung über die Festsetzung der pauschalen Förderung nach § 20 Absatz 4 des Landeskrankenh | GVOBl. S. 341 | announced-only | jlr-NNLSH00002D1E | reconstruction |
| 2024-12-31 | expire | B 2122-10-2 | Landesverordnung über die Ausbildung und Durchführung der Pflegeberufeausbildung (Pflegeberufe-Ausbi | GVOBl. S. 23 | announced-only | jlr-NNLSH0000314D | import-ready |
| 2024-12-31 | expire | 2130-14-22 | Landesverordnung über Anforderungen an Herstellerinnen und Hersteller von Bauprodukten und Anwenderi | GVOBl. S. 748 | announced-only | – | – |
| 2024-12-31 | expire | 2130-14-23 | Landesverordnung über die Anerkennung als Prüf-, Überwachungs- oder Zertifizierungsstelle nach Bauor | GVOBl. S. 749 | announced-only | jlr-NNLSH0000303F | import-ready |
| 2024-12-31 | expire | 2186-25-1 | Landesverordnung über Zweckabgaben für in öffentlicher Trägerschaft veranstaltete Lotterien (LottZwA | GVOBl. S. 841 | announced-only | jlr-NNLSH00002BC9 | import-ready |
| 2024-12-31 | expire | 707-4-18 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Investitionsbank Schleswig-Holstein | GVOBl. S. 649 | announced-only | jlr-NNLSH0000305C | import-ready |
| 2024-12-31 | expire | B 850-1-2 | Landesverordnung über das Verfahren der Evaluation nach dem Kindertagesförderungsgesetz (Kita-Evalua | GVOBl. S. 15 | announced-only | jlr-NNLSH00003048 | import-ready |
| 2024-12-31 | expire | 90-1-13 | Landesverordnung über die Kostentragung bei der Verwaltung von Kreisstraßen durch das Land | GVOBl. S. 140 | announced-only | jlr-NNLSH00003023 | import-ready |
| 2025-01-31 | expire | 2013-2-69 | Landesverordnung über Gebühren des Landesamtes für Vermessung und Geoinformation Schleswig-Holstein  | GVOBl. S. 817 | announced-only | jlr-NNLSH00002BD4 | review |
| 2025-01-31 | expire | 2124-3-7 | Landesverordnung über die Vergütung für Leistungen der Hebammen und Entbindungspfleger gegenüber Sel | GVOBl. S. 134 | announced-only | jlr-NNLSH00002BB9 | import-ready |
| 2025-01-31 | expire | 219-8-9 | Landesverordnung über die Vergütung der Öffentlich bestellten Vermessungsingenieurinnen und Öffentli | GVOBl. S. 829 | announced-only | jlr-NNLSH00002BD1 | import-ready |
| 2025-02-28 | expire | 2130-14-24 | Landesverordnung über die Überwachung von Tätigkeiten mit Bauprodukten und bei Bauarten (ÜTVO) | GVOBl. S. 20 | announced-only | jlr-NNLSH0000300D | import-ready |
| 2025-02-28 | expire | 2130-14-25 | Landesverordnung über das Übereinstimmungszeichen (Übereinstimmungszeichen-Verordnung - ÜZVO) | GVOBl. S. 17 | announced-only | jlr-NNLSH00003046 | import-ready |
| 2025-05-07 | expire | 630-2-1 | Landesverordnung über das Verfahren zur Bestimmung der Konjunkturkomponente nach § 5 des Gesetzes zu | GVOBl. S. 210 | announced-only | jlr-NNLSH00003047 | import-ready |
| 2025-05-30 | expire | 2011-0-21 | Landesverordnung zur Abwehr von Gefahren für die öffentliche Sicherheit durch Kampfmittel (Kampfmitt | GVOBl. S. 607 | announced-only | jlr-NNLSH00002B66 | import-ready |
| 2025-06-25 | expire | 7220-4-3 | Landesverordnung zur Feststellung der repräsentativen Tarifverträge im Bereich des öffentlichen Pers | GVOBl. S. 305 | announced-only | jlr-NNLSH00002B95 | review |
| 2025-06-29 | expire | 224-11-1 | Landesverordnung über den Denkmalrat (Denkmalratsverordnung) | GVOBl. S. 299 | announced-only | jlr-NNLSH00002B51 | import-ready |
| 2025-06-29 | expire | 224-11-2 | Landesverordnung über die Vertrauensleute für Kulturdenkmale | GVOBl. S. 300 | announced-only | jlr-NNLSH00002B4A | import-ready |
| 2025-06-29 | expire | 224-11-3 | Landesverordnung über die Einführung des Zustimmungsvorbehalts bei Genehmigungsverfahren betreffend  | GVOBl. S. 300 | announced-only | jlr-NNLSH00002B4C | import-ready |
| 2025-06-29 | expire | 224-11-4 | Landesverordnung über die Einführung des Zustimmungsvorbehalts bei Genehmigungsverfahren betreffend  | GVOBl. S. 301 | announced-only | jlr-NNLSH00002B4B | import-ready |
| 2025-06-29 | expire | 224-11-5 | Landesverordnung über das Verfahren zur Ausweisung von Denkmalbereichen und Grabungsschutzgebieten | GVOBl. S. 301 | announced-only | jlr-NNLSH00002B4E | import-ready |
| 2025-06-29 | expire | 224-11-6 | Landesverordnung über die Denkmallisten für Kulturdenkmale | GVOBl. S. 302 | announced-only | jlr-NNLSH00002B4D | import-ready |
| 2025-06-30 | expire | 707-4-23 | Landesverordnung über Verwaltungsgebühren für Amtshandlungen der Investitionsbank Schleswig-Holstein | GVOBl. S. 465 | announced-only | jlr-NNLSH00002D21 | not-at-baseline |
| 2025-07-09 | expire | 204-5-3 | Landesverordnung über die zentrale Stelle für ressortübergreifende Personalmanagementverfahren | GVOBl. S. 379 | announced-only | jlr-NNLSH00002B42 | import-ready |
| 2025-08-26 | expire | 2031-3-3 | Landesverordnung über Dienstvorgesetzte der Polizei nach dem Landesdisziplinargesetz | GVOBl. S. 492 | announced-only | jlr-NNLSH00002FF3 | import-ready |
| 2025-08-30 | expire | 2013-2-65 | Landesverordnung über Verwaltungsgebühren in Angelegenheiten der Lebensmittel- und Bedarfsgegenständ | GVOBl. S. 471 | announced-only | jlr-NNLSH00002B1F | import-ready |
| 2025-10-28 | expire | 114-0-4 | Landesverordnung über die örtliche Bekanntmachung und Verkündung (Bekanntmachungsverordnung - Bekann | GVOBl. S. 573 | announced-only | jlr-NNLSH00002B12 | import-ready |
| 2025-12-31 | expire | 780-3-31 | Landesverordnung über die Wahl der Hauptversammlung der Landwirtschaftskammer Schleswig-Holstein (Wa | GVOBl. S. 538 | announced-only | jlr-NNLSH00003019 | review |
| 2025-12-31 | expire | B 850-1-3 | Landesverordnung über die Personalqualifikation in öffentlich geförderten Kindertageseinrichtungen ( | GVOBl. S. 851 | announced-only | jlr-NNLSH00002B9B | reconstruction |
| 2025-12-31 | expire | 90-1-14 | Landesverordnung über die Kostentragung bei der Verwaltung von Kreisstraßen durch das Land | GVOBl. S. 852 | announced-only | jlr-NNLSH00002AF4 | not-at-baseline |
| 2026-02-19 | expire | 12-3-2 | Landesverordnung zur Feststellung der lebenswichtigen Einrichtungen im Sinne des § 2 Absatz 2 des La | GVOBl. S. 263 | announced-only | – | – |
| 2026-06-10 | expire | B 864-8-16 | Landesverordnung über die Freistellung für ehrenamtliche Mitarbeit in der Jugendarbeit (Freistellung | GVOBl. S. 646 | announced-only | jlr-NNLSH00003029 | import-ready |

