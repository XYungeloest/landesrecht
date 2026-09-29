# Sim-Verkündungsinventar: bekannte, vorhandene und fehlende Quellen

Erzeugt von `npm run import:simulation:completeness -- --write` aus `data/simulation/<land>/completeness.json`. Eine
Ausgabe gilt als bekannt, wenn Nummernfolge, Querverweis oder Verkündungsmitteilung sie belegen; „fehlend“ ist die
konkrete Suchliste. Eine bislang fehlende Quelle, die im Archiv `imports/` auftaucht, wird über das Inventar und die
Bewertung nachgetragen (Status je Land bleibt `SIM SOURCES PARTIAL`, bis alle bekannten Lücken geschlossen sind).

Blattabdeckung und Gesamtstatus sind getrennt (docs/SIMULATION_IMPORT.md, Abschnitt 7.2): „alle bekannten Ausgaben
vorhanden“ heißt nicht, dass der Sim-Rechtsstand vollständig belegt ist. Beschaffbare Quellen: `docs/SIM_SOURCE_ACQUISITION.md`.

## Land Westdeutschland (`west`) – SIM SOURCES PARTIAL, Stand 2026-09-29

- Blattabdeckung: **PARTIAL** (22/23 bekannte Ausgaben, 5 verdächtig)
- Einzelverkündungen: **COMPLETE** (9 vorhanden, 0 nur als Beleg, 0 fehlend)
- Sim-Quellen gesamt: **PARTIAL** · fehlende Quellen 1 · Evidenz unvollständig 7 · mögliche Lücken 1 + 4 Zeiträume
- Ereignisse: 41 applied, 0 pending, 38 review, 17 blocked (davon 10 wegen Zielnorm außerhalb des eingefrorenen Bestands), 7 not-promulgated; quellenbedingt offen 28; letzte Quelle 2026-09-18

| Blattreihe | bekannt | vorhanden | fehlend | verdächtig |
| --- | ---: | ---: | --- | --- |
| GV. West – Gesetz- und Verordnungsblatt für Westdeutschland (2024 Serie A) / Westdeutsches Gesetzes- und Verordnungsblatt (2024 Serie B) / Gesetzes- und Verordnungsblatt Des Landes Westdeutschland (2025) / Gesetzes und Verordnungsblatt für das Land Westdeutschland (2025 Nr. 05, 2026) | 16 | 16 | – | 2024 Nr. 04 (Serie B, 24.09.2024) setzt nach dem Blattverzeichnis die Zählung 2024 Nr. 01–03 fort; die als „Nr. 1“ und „Nr. 2“ gedruckten Ausgaben vom 01.10. und 10.11.2024 führt das Verzeichnis als Nr. 05 und Nr. 06; 2024 Nr. 1 und Nr. 2 doppelt (Serie A Februar/April, Serie B Oktober/November); 2025: laufende Nummern 07–11 neben 01/2025–05/2025 (das Blattverzeichnis zählt 07–10 = 1/2025–4/2025 durch), widersprüchliche Fußzeilen; 2026 Nr. 3 dreifach vergeben (29.06. mit Platzhalterdatum, 26.08., 18.09.); Nummern 4 ff. unbekannt |
| MBl. WD – Ministerialblatt für das Land Westdeutschland | 7 | 6 | 2026 Nr. 2 | 2026 Nr. 3 mit Platzhalter-Ausgabedatum „09. Monat 2026“ |

Einzelakte ohne Blattausgabe: 9 vorhanden, 0 nur als Verkündungsbeleg.

Ungeklärte Zeiträume (Suchliste):

- 2024-04-23 – 2024-09-23: Keine Ausgabe zwischen Serie A Nr. 3 (22.04.2024) und Serie B Nr. 04/2024 (24.09.2024); Waldbrandpräventionsverordnung vom 1. Mai 2024 nur als unverkündetes Einzeldokument.
- 2024-11-11 – 2025-03-09: Keine Ausgabe zwischen Nr. 2/2024 (10.11.2024) und Nr. 01/2025 (10.03.2025); Gesetze „vom 12.12.2024“ erst am 10.03.2025 ausgefertigt.
- 2025-09-07 – 2025-12-17: Keine Ausgabe des Gesetz- und Verordnungsblatts zwischen Nr. 04/2025 und Nr. 05/2025; nur Ministerialblätter Nr. 1–3.
- 2026-05-18 – 2026-09-17: Ausgaben mit Platzhaltern (GV. West „Nr. 3“ vom 29.06.2026, MBl. WD 2026 Nr. 3), Ministerialblatt 2026 Nr. 2 fehlt; Umzug der Landesregierung nach Mainz nur als Entwurf belegt.

Lücken A – Blattausgabe fehlt:

- `west-mbl-2026-2` Ministerialblatt für das Land Westdeutschland (MBl. WD) 2026 Nr. 2 (P2)

Lücken C – Evidenz unvollständig (Quelle vorhanden):

- `west-verfassung-2024` Verfassung für Westdeutschland vom 23.02.2024 – Ausfertigung und Volksabstimmung (P3)
- `west-haushalt-2024-anlage` Haushaltsplan 2024 (Anlage zum Haushaltsgesetz, GV. West 2024 Nr. 3 S. 77) (P3)
- `west-grenzkontrollen-2024` Verordnung zur Einführung von Grenzkontrollen (Einzelausfertigung 24-MP-02-V-01 vom 16.08.2024) und ihre Aufhebung (P3)
- `west-south-carolina-2024` Gesetz zu dem Partnerschaftsabkommen mit South Carolina (GV. West 2024 Nr. 3 S. 84)
- `west-entwurf-verkuendet` Als „Entwurf“ betitelte, aber ausgefertigte Gesetze (GV. West 2024 Nr. 2 Serie B, 2025 Nr. 01/02, 2026 Nr. 1)
- `west-bauordnung-2026` Gesetz zur Novellierung des Landesbaurechts (GV. West 2026 Nr. 2 S. 27)
- `west-2026-platzhalter` Ausgaben mit Platzhalterdatum: GV. West 2026 Nr. 3 (29.06.2026) und MBl. WD 2026 Nr. 3 („09. Monat 2026“)

Lücken D – mögliche Lücke (nie als fehlende Quelle gezählt):

- `west-gv-2026-nr4ff` GV. West 2026 Nr. 4 ff.

Hinweise zu fehlenden Quellen:

- Rechtsstand nicht vollständig belegbar: Lücken in den Nummernfolgen, dreifache Nummer 3 im Jahrgang 2026, fehlendes Ministerialblatt 2026 Nr. 2, Ausgaben mit Platzhaltern.
- Blattverzeichnis (gvbl.wiki): Gesetzblätter 2024 Nr. 01–06, 2025 Nr. 07–10, 2026 Nr. 11–12 (17.05.2026) und Ministerialblätter 2025 Nr. 1–2 – alle im Archiv; keine neue Ausgabe. Sekundärquelle (Ebene 4): nur Ausgabenfolge und Lückenerkennung. Das Verzeichnis endet am 17.05.2026 und führt GV. West 2025 Nr. 05, MBl. WD 2025 Nr. 3 und die Ausgaben ab Juni 2026 nicht; die dreifache „Nr. 3“ 2026, die Nummern 4 ff. und das fehlende MBl. WD 2026 Nr. 2 bleiben ungeklärt.

## Land Niedersachsen-Holstein (`nsh`) – SIM SOURCES PARTIAL, Stand 2026-09-29

- Blattabdeckung: **PARTIAL** (5/6 bekannte Ausgaben, 1 verdächtig)
- Einzelverkündungen: **COMPLETE** (15 vorhanden, 4 nur als Beleg, 0 fehlend)
- Sim-Quellen gesamt: **PARTIAL** · fehlende Quellen 1 · Evidenz unvollständig 7 · mögliche Lücken 0 + 2 Zeiträume
- Ereignisse: 33 applied, 0 pending, 28 review, 4 blocked (davon 4 wegen Zielnorm außerhalb des eingefrorenen Bestands), 2 not-promulgated; quellenbedingt offen 17; letzte Quelle 2026-09-02

| Blattreihe | bekannt | vorhanden | fehlend | verdächtig |
| --- | ---: | ---: | --- | --- |
| NH GVBl. MAL-I – Niedersächsisch-Holsteinisches Gesetz- und Verordnungsblatt | 2 | 2 | – | Teil 1/2024 |
| NSH GVBl. LAH-I – Niedersächsisch-Holsteinisches Gesetz- und Verordnungsblatt | 1 | 1 | – | – |
| NSH GVBl. LAH-II – Niedersächsisch-Holsteinisches Gesetz- und Verordnungsblatt | 2 | 2 | – | – |

Einzelakte ohne Blattausgabe: 15 vorhanden, 4 nur als Verkündungsbeleg.

Ungeklärte Zeiträume (Suchliste):

- 2024-03-05 – 2025-08-03: Keine Blattausgabe zwischen NH GVBl. MAL-I Teil 2/2024 (04.03.2024) und NSH GVBl. LAH-I Teil 1/2025 (04.08.2025); Verkündungen nur durch Mitteilungen (08.07.2024, 17.09.2024, 26.12.2024, 05.05.2025, 12.05.2025). Für 08.07.2024 wurde ein Gesetzblatt angekündigt („Aushändigung folgt in Kürze“), das nicht vorliegt; die verkündeten Drucksachen 02/09–13 liegen vor und stehen wortgleich in LAH-I Teil 1/2025.
- 2025-08-05 – 2026-09-01: Keine Blattausgabe zwischen LAH-I Teil 1/2025 und LAH-II Teil 1/2026 (02.09.2026); Verkündung 24.11.2025 nur durch Mitteilung (Drucksachen 05/06–05/10, später in LAH-II Teil 1/2026). Regime-Bezeichnungen der Blätter (Maluchel I, Lahn I, Lahn II) decken die Regierungen Röttgen, Newsorow und Ulbricht nicht ab.

Lücken A – Blattausgabe fehlt:

- `nsh-gvbl-2024-07-08` Gesetzblatt zur Verkündung vom 08.07.2024 (P2)

Lücken C – Evidenz unvollständig (Quelle vorhanden):

- `nsh-mal-i-2024-sieben-gesetze` Sieben im Inhaltsverzeichnis von NH GVBl. MAL-I Teil 1/2024 genannte Gesetze (u. a. Landesverfassungsschutzgesetz, Änderung der Landesverfassung) (P1)
- `nsh-staatsvertrag-2025-12-09` Staatsvertrag zum Gesetz vom 09.12.2025 (NSH GVBl. LAH-II Teil 2/2026 S. 8–9) (P2)
- `nsh-landesverfassung-2024` Landesverfassung Niedersachsen-Holstein (NH GVBl. MAL-I Teil 1/2024 S. 4–26) (P3)
- `nsh-sondvrseg-2025` Gesetz zur Errichtung eines Sondervermögens (NSH SondVRsEG, Drucksache 04/14)
- `nsh-schulgesetz-2026` Schulverordnungen 2026 auf Grundlage des nicht verkündeten Schulgesetzes (SchulReNeuOG) (P3)
- `nsh-wirkdaten` Akte ohne bestimmbares Inkrafttreten (Budgetgesetz „F…“, Erste-Hilfe- und Schwimmkurs-Verordnung, Landesfonds)
- `nsh-videoueberwachung-2025` Verordnung zur Videoüberwachung und Sicherheit im öffentlichen Raum (06.03.2025)

Hinweise zu fehlenden Quellen:

- Verdächtig: MAL-I Teil 1/2024 enthält nur die Landesverfassung (S. 4–26), das Inhaltsverzeichnis nennt sieben weitere Gesetze („Fehler! Textmarke nicht definiert.“), die fehlen.
- Fehlende Quellen: das für den 08.07.2024 angekündigte Gesetzblatt; Staatsvertrag zum Gesetz vom 09.12.2025 (im Blatt nicht abgedruckt); die sieben im Inhaltsverzeichnis von MAL-I Teil 1/2024 genannten Gesetze.

## Freistaat Bayern-Württemberg (`baywue`) – SIM SOURCES PARTIAL, Stand 2026-09-29

- Blattabdeckung: **COMPLETE** (8/8 bekannte Ausgaben, 2 verdächtig)
- Einzelverkündungen: **PARTIAL** (28 vorhanden, 3 nur als Beleg, 5 fehlend)
- Sim-Quellen gesamt: **PARTIAL** · fehlende Quellen 5 · Evidenz unvollständig 6 · mögliche Lücken 1 + 2 Zeiträume
- Ereignisse: 35 applied, 0 pending, 28 review, 18 blocked (davon 17 wegen Zielnorm außerhalb des eingefrorenen Bestands), 0 not-promulgated; quellenbedingt offen 18; letzte Quelle 2026-08-30

| Blattreihe | bekannt | vorhanden | fehlend | verdächtig |
| --- | ---: | ---: | --- | --- |
| GVBl. Süd – Gesetzes- und Verordnungsblatt des Freistaates Süddeutschland | 1 | 1 | – | – |
| GVBl. BayWü – Gesetzes- und Verordnungsblatt des Freistaates Bayern-Württemberg (2025) / Gesetz- und Verordnungsblatt für den Freistaat Bayern-Württemberg (2026) | 7 | 7 | – | 2025 Nr. 3; 2026 Nr. 3 |

Einzelakte ohne Blattausgabe: 28 vorhanden, 3 nur als Verkündungsbeleg.

Ungeklärte Zeiträume (Suchliste):

- 2025-04-30 – 2026-05-28: Keine Blattausgabe über 13 Monate (das Blattverzeichnis führt zwischen 2025 Nr. 3 und 2026 Nr. 1 keine Ausgabe); das Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden vom 14. Mai 2026 wird vom Aufhebungsgesetz vom 26. Juni 2026 vorausgesetzt, ist aber weder im Archiv (nur Entwurf) noch im Blattverzeichnis als verkündet belegt.
- 2026-08-31 – 2026-09-28: Keine Quelle nach GVBl. BayWü 2026 Nr. 4 (30. August 2026); das Blattverzeichnis endet mit dieser Ausgabe.

Lücken B – amtlicher Einzelakt fehlt (Existenz sonst belegt):

- `baywue-erdbebenhilfeg-2026` Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden in Bayern-Württemberg vom 14.05.2026 (P1)
- `baywue-ago-bekanntmachung-2026-05-31` Bekanntmachung vom 31.05.2026 der AGO-Änderungsverordnung 26-StIH-07-V-03 (P2)
- `baywue-grenzschutz-2024` Weitere „Verordnungen betreffend des Grenzschutzes“ 2024 (u. a. Verordnung zur Verstärkung der Polizeipräsenz an den Süddeutschen Auslandsgrenzen vom 16.08.2024) (P2)
- `baywue-verfassung-2025-originalblatt` Original-Verkündungsblatt der Staatsverfassung vom 12.01.2025 (P3)
- `baywue-orgerlass-2025-02-14` Organisationserlass 25-MP-04-OE-01 vom 14.02.2025 (P3)

Lücken C – Evidenz unvollständig (Quelle vorhanden):

- `baywue-gvbl-2025-2-seite-11` GVBl. BayWü 2025 Nr. 2 – vollständiges PDF (Seite 11 fehlt, Duplikat von Seite 10) (P2)
- `baywue-einzelverordnungen-2025-01` Amtliche Verkündungsbelege der Einzelverordnungen Januar 2025 (Sexualkunde, Unterrichtsbeginn, Hausaufgaben, KZ-Besuchspflicht, Wolfsverordnung, Grenzüberwachung) (P2)
- `baywue-haushalt-2026-anlage` Haushaltsplan 2026 (Anlage zum Haushaltsgesetz 2026) (P3)
- `baywue-druckmaengel` Druckmängel verkündeter Gesetze (Landarzt-Stipendiengesetz GVBl. Süd 2024 Nr. 1, SchuSprG GVBl. BayWü 2025 Nr. 1) (P3)
- `baywue-wirkdaten` Verkündete Akte ohne bestimmbares Wirkdatum (Meisterpflichtgesetz, Gesetz zur Stärkung der Familiengesundheit) (P3)
- `baywue-rainer-winkler-orden` Bekanntmachung über die Stiftung des Rainer-Winkler-Ordens (05.06.2026, „Nr. 1, Ausgegeben zu Stuttgart“)

Lücken D – mögliche Lücke (nie als fehlende Quelle gezählt):

- `baywue-handlungsfaehigkeit-ausserkrafttreten` Bekanntmachung des Außerkrafttretens des Gesetzes zur Sicherstellung der Handlungsfähigkeit der Staatsorgane

Hinweise zu fehlenden Quellen:

- Fehlende Quellen: Original-Verkündungsblatt der Staatsverfassung vom 12. Januar 2025 (Artikel 92 Absatz 1; der Text liegt vor, die Verkündung belegt eine undatierte Mitteilung des Justizministeriums, das Datum spätere Blattausgaben – Quellenstatus „mittelbar amtlich belegt“); Organisationserlass vom 14. Februar 2025; Erdbebenhilfegesetz vom 14. Mai 2026 (nur Entwurf, durch Gesetz vom 26. Juni 2026 aufgehoben); „Bekanntmachung vom 31. Mai 2026“ der AGO-Änderungsverordnung; weitere „Verordnungen betreffend des Grenzschutzes“ 2024 (Plural; das Blattverzeichnis nennt eine „Verordnung zur Verstärkung der Polizeipräsenz an den Süddeutschen Auslandsgrenzen“ vom 16. August 2024); Bekanntmachung des Außerkrafttretens des Handlungsfähigkeitsgesetzes; Anlage (Haushaltsplan) zum Haushaltsgesetz 2026; amtliche Verkündungsbelege der Einzelverordnungen vom Januar 2025, die nur das Blattverzeichnis (Sekundärquelle) als veröffentlicht führt.
- Druckmängel: GVBl. BayWü 2025 Nr. 2 – Seite 6 fehlt in der Zählung, Seite 11 ist ein Duplikat von Seite 10 (SzFdPBbJG unvollständig prüfbar); GVBl. Süd 2024 Nr. 1 – § 7 Abs. 2 des Landarzt-Stipendiengesetzes im Satz zerlegt; GVBl. BayWü 2025 Nr. 1 – SchuSprG mit verrutschten §-Bezeichnungen.
- Blockierte Zielnorm (Baseline fehlt): abgeordnetengesetz-baywue – Bayerisches Abgeordnetengesetz (BayAbgG, BayRS 1100-1-I); benötigt von: gesetz-zur-aenderung-des-sueddeutschen-abgeordnetengesetzes-2024-baywue.
- Blockierte Zielnorm (Baseline fehlt): pog-baywue – Gesetz über die Organisation der Bayerischen Polizei (Polizeiorganisationsgesetz) (POG, BayRS 2012-2-1-I); benötigt von: BayWueLEXG (GVBl. BayWü 2025 Nr. 2 S. 4, Review); Erlass zur Aufwertung des Grenzschutzes 25-StMIFIKJ-04-E-02 (Review, aufgehoben 13.04.2025).
- Blockierte Zielnorm (Baseline fehlt): gso-baywue – Schulordnung für die Gymnasien in Bayern (Gymnasialschulordnung) (GSO, BayRS 2235-1-1-1-K); benötigt von: Schwimmunterrichtsveranlassungsverordnung 25-MP-04-V-01 (Review).
- Blockierte Zielnorm (Baseline fehlt): pag-baywue – Gesetz über die Aufgaben und Befugnisse der Bayerischen Staatlichen Polizei (Polizeiaufgabengesetz) (PAG, BayRS 2012-1-1-I); benötigt von: distanz-elektroimpulsgeraete-g-baywue; gesetz-zur-aenderung-des-polizeiaufgabengesetzes-2026-baywue.
- Blockierte Zielnorm (Baseline fehlt): bayschfg-baywue – Bayerisches Schulfinanzierungsgesetz (BaySchFG, BayRS 2230-7-1-K); benötigt von: gesetz-zur-aenderung-des-schulfinanzierungsgesetzes-2026-baywue; trinkwasserspender-schulen-g-baywue.
- Blockierte Zielnorm (Baseline fehlt): bayeug-baywue – Bayerisches Gesetz über das Erziehungs- und Unterrichtswesen (BayEUG, BayRS 2230-1-1-K); benötigt von: landesschuelerrat-modernisierungsg-baywue; notensystem-erneuerungsg-baywue; trinkwasserspender-schulen-g-baywue.
- Blockierte Zielnorm (Baseline fehlt): bayfag-baywue – Gesetz über den Finanzausgleich zwischen Staat, Gemeinden und Gemeindeverbänden (Bayerisches Finanzausgleichsgesetz) (BayFAG, BayRS 605-1-F); benötigt von: verkehrsinfrastruktur-erhaltg-baywue (Artikel 2).
- Blockierte Zielnorm (Baseline fehlt): baystrwg-baywue – Bayerisches Straßen- und Wegegesetz (BayStrWG, BayRS 91-1-B); benötigt von: strassengesetz-aenderungsg-2026-baywue.
- Blockierte Zielnorm (Baseline fehlt): ago-baywue – Allgemeine Geschäftsordnung für die Behörden des Freistaates Bayern (AGO, BayRS 200-21-I); benötigt von: ago-aenderungsv-2026-baywue.
- Blockierte Zielnorm (Baseline fehlt): gemeindeordnung-baywue – Gemeindeordnung für den Freistaat Bayern (GO, BayRS 2020-1-1-I); benötigt von: jugendbeiraete-gemeindeordnung-g-baywue.
- Blockierte Zielnorm (Baseline fehlt): bayoepnvg-baywue – Gesetz über den öffentlichen Personennahverkehr in Bayern (BayÖPNVG, BayRS 922-1-B); benötigt von: fig-baywue (Artikel 2).
- Blockierte Zielnorm (Baseline fehlt): grso-baywue – Schulordnung für die Grundschulen in Bayern (Grundschulordnung) (GrSO, BayRS 2232-2-K); benötigt von: grundschuelerentlastungsv-baywue.
- Blockierte Zielnorm (Baseline fehlt): baykibig-baywue – Bayerisches Gesetz zur Bildung, Erziehung und Betreuung von Kindern in Kindergärten, anderen Kindertageseinrichtungen und in Tagespflege (Bayerisches Kinderbildungs- und -betreuungsgesetz) (BayKiBiG, BayRS 2231-1-A); benötigt von: Gesetz zur Stärkung der Familiengesundheit (GVBl. BayWü 2026 Nr. 4 S. 13, Review).
- Blockierte Zielnorm (Sim-Norm fehlt): erdbebenhilfeg-2026-baywue – Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden in Bayern-Württemberg vom 14. Mai 2026 (nur Entwurf); benötigt von: erdbebenhilfeg-aufhebungsg-baywue.
- Verfassungsänderung „vom 7. Mai 2026“: nur in der Eingangsformel des Änderungsgesetzes zu Artikel 24 genannt; das Blattverzeichnis führt für 2026 genau die fünf vorliegenden Änderungsgesetze, deren Alttexte lückenlos aneinander anschließen – kein eigener fehlender Akt belegt.

