# Sim-Quellenakquise

Erzeugt von `npm run import:simulation:completeness -- --write` aus den `sourceGaps` in `data/simulation/<land>/completeness.json`;
maschinenlesbar: `data/simulation/source-acquisition-queue.json`. Nur nützliche Quellen; mögliche Lücken (Klasse D) und bekannte Sackgassen stehen
nicht darin. P1 entsperrt mehrere Akte oder eine zentrale Norm, P2 schließt eine klare Publikationslücke, P3 dient nur
Vollständigkeit oder Provenienz. Eine beschaffte Quelle wird archiviert, im Inventar erfasst und die Lücke in
`completeness.json` geschlossen; Ost ist nicht Teil der Liste (OstRecht ist vorgelagertes Quellsystem).

Summe: 19 (P1 2, P2 7, P3 10).

## P1

### BayWü: Gesetz zur Bereitstellung finanzieller Hilfen für Erdbebenschäden in Bayern-Württemberg vom 14.05.2026

- **Was fehlt:** B – Einzelakt fehlt; erwartet: Einzelverkündung oder GVBl. BayWü (Mai 2026), 2026-05-14.
- **Existenzbeleg:** Das verkündete Aufhebungsgesetz (GVBl. BayWü 2026 Nr. 2 S. 8) hebt es „vom 14.05 2026“ auf; im Archiv liegt nur der Entwurf 26-StMWF-07-GE-02.
- **Entsperrt:** 1 Ledger-Ereignis, Norm `erdbebenhilfeg-2026-baywue`.
- **Sicherheit / Status:** high / open (`baywue-erdbebenhilfeg-2026`).

### NSH: Sieben im Inhaltsverzeichnis von NH GVBl. MAL-I Teil 1/2024 genannte Gesetze (u. a. Landesverfassungsschutzgesetz, Änderung der Landesverfassung)

- **Was fehlt:** C – Evidenz unvollständig (Wortlaut); erwartet: NH GVBl. MAL-I Teil 1/2024 (vollständige Fassung).
- **Existenzbeleg:** Das Inhaltsverzeichnis der vorliegenden Ausgabe nennt die Gesetze mit Seitenangaben („Fehler! Textmarke nicht definiert.“); abgedruckt ist nur die Landesverfassung.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** medium / open (`nsh-mal-i-2024-sieben-gesetze`).

## P2

### BayWü: Bekanntmachung vom 31.05.2026 der AGO-Änderungsverordnung 26-StIH-07-V-03

- **Was fehlt:** B – Einzelakt fehlt, 2026-05-31.
- **Existenzbeleg:** Die Abschaffungsverordnung (GVBl. BayWü 2026 Nr. 3 S. 6) setzt die Änderungsverordnung „in der Fassung der Bekanntmachung vom 31. Mai 2026“ außer Kraft.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** high / open (`baywue-ago-bekanntmachung-2026-05-31`). Die Zielnorm AGO ist aus dem eingefrorenen Ausgangsrechtsstand ausgeschlossen; die Quelle klärt die Publikation, entsperrt aber keine Konsolidierung.

### BayWü: Amtliche Verkündungsbelege der Einzelverordnungen Januar 2025 (Sexualkunde, Unterrichtsbeginn, Hausaufgaben, KZ-Besuchspflicht, Wolfsverordnung, Grenzüberwachung)

- **Was fehlt:** C – Evidenz unvollständig (Verkündung), 2025-01.
- **Existenzbeleg:** Die Dokumente liegen vor; das Blattverzeichnis (Sekundärquelle, Ebene 4) führt sie als veröffentlicht, ein amtlicher Verkündungsbeleg fehlt.
- **Entsperrt:** 6 Ledger-Ereignisse.
- **Sicherheit / Status:** medium / open (`baywue-einzelverordnungen-2025-01`). Blattverzeichnis allein ist nie Verkündungsgrundlage (Gate G11).

### BayWü: Weitere „Verordnungen betreffend des Grenzschutzes“ 2024 (u. a. Verordnung zur Verstärkung der Polizeipräsenz an den Süddeutschen Auslandsgrenzen vom 16.08.2024)

- **Was fehlt:** B – Einzelakt fehlt, 2024-08-16.
- **Existenzbeleg:** Die Aufhebungsmitteilung vom 22.08.2024 spricht im Plural von Verordnungen; das Blattverzeichnis nennt eine weitere Verordnung vom 16.08.2024.
- **Entsperrt:** 2 Ledger-Ereignisse.
- **Sicherheit / Status:** medium / open (`baywue-grenzschutz-2024`).

### BayWü: GVBl. BayWü 2025 Nr. 2 – vollständiges PDF (Seite 11 fehlt, Duplikat von Seite 10)

- **Was fehlt:** C – Evidenz unvollständig (Wortlaut); erwartet: GVBl. BayWü 2025 Nr. 2 S. 11.
- **Existenzbeleg:** Die Ausgabe liegt vor, Seite 11 ist durch ein Duplikat ersetzt; Artikel 10 des Stiftungsgesetzes ist nicht prüfbar.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** high / open (`baywue-gvbl-2025-2-seite-11`).

### NSH: Gesetzblatt zur Verkündung vom 08.07.2024

- **Was fehlt:** A – Blattausgabe fehlt; erwartet: Gesetzblatt Niedersachsen-Holstein (Juli 2024), 2024-07.
- **Existenzbeleg:** Die Verkündungsmitteilung vom 08.07.2024 kündigt ein Gesetzblatt an („Aushändigung folgt in Kürze“); die verkündeten Drucksachen 02/09–13 liegen vor und stehen wortgleich in LAH-I Teil 1/2025.
- **Entsperrt:** nichts (nur Vollständigkeit/Provenienz).
- **Sicherheit / Status:** medium / open (`nsh-gvbl-2024-07-08`). Rechtswirkung bereits durch Drucksache und Verkündungsmitteilung belegt; die Quelle schließt eine Publikationslücke.

### NSH: Staatsvertrag zum Gesetz vom 09.12.2025 (NSH GVBl. LAH-II Teil 2/2026 S. 8–9)

- **Was fehlt:** C – Evidenz unvollständig (Anlage, Wortlaut); erwartet: NSH GVBl. LAH-II Teil 2/2026 (Anlage).
- **Existenzbeleg:** Das Vertragsgesetz nennt den „nachstehend veröffentlichten“ Staatsvertrag (datiert 08.03.2026); er fehlt im Blatt.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** high / open (`nsh-staatsvertrag-2025-12-09`).

### West: Ministerialblatt für das Land Westdeutschland (MBl. WD) 2026 Nr. 2

- **Was fehlt:** A – Blattausgabe fehlt; erwartet: MBl. WD 2026 Nr. 2, 2026-07.
- **Existenzbeleg:** Nummernfolge: MBl. WD 2026 Nr. 1, 3 und 4 liegen vor, Nr. 2 fehlt; der Runderlass zu Kühlräumen (28.06.2026) ist ohne Blattausgabe überliefert.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** high / open (`west-mbl-2026-2`).

## P3

### BayWü: Druckmängel verkündeter Gesetze (Landarzt-Stipendiengesetz GVBl. Süd 2024 Nr. 1, SchuSprG GVBl. BayWü 2025 Nr. 1)

- **Was fehlt:** C – Evidenz unvollständig (Wortlaut).
- **Existenzbeleg:** Ausgaben liegen vor; Druckbild zerlegt bzw. §-Bezeichnungen verrutscht – Wortlaut nicht ohne Rekonstruktion transkribierbar.
- **Entsperrt:** 2 Ledger-Ereignisse.
- **Sicherheit / Status:** low / open (`baywue-druckmaengel`). Nur eine berichtigte Ausgabe würde helfen.

### BayWü: Haushaltsplan 2026 (Anlage zum Haushaltsgesetz 2026)

- **Was fehlt:** C – Evidenz unvollständig (Anlage).
- **Existenzbeleg:** Das verkündete Haushaltsgesetz 2026 verweist auf den Haushaltsplan als Anlage; die Anlage liegt nicht vor.
- **Entsperrt:** 1 Ledger-Ereignis, Norm `haushaltsgesetz-2026-baywue`.
- **Sicherheit / Status:** medium / open (`baywue-haushalt-2026-anlage`).

### BayWü: Organisationserlass 25-MP-04-OE-01 vom 14.02.2025

- **Was fehlt:** B – Einzelakt fehlt, 2025-02-14.
- **Existenzbeleg:** In späteren Organisationserlassen zitiert (Gründung des Staatsministeriums für Wissenschaft, Forschung, Kunst und Sport); das Dokument fehlt im Archiv.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** high / open (`baywue-orgerlass-2025-02-14`). Organisationsakt, keine Rechtsnorm im Sinne des Bestands.

### BayWü: Original-Verkündungsblatt der Staatsverfassung vom 12.01.2025

- **Was fehlt:** B – Einzelakt fehlt, 2025-01-12.
- **Existenzbeleg:** Text liegt vor; die Verkündung belegt eine undatierte Mitteilung des Justizministeriums (Artikel 92 Absatz 1), das Datum spätere Blattausgaben – mittelbar amtlich belegt.
- **Entsperrt:** Norm `staatsverfassung-2025-baywue`.
- **Sicherheit / Status:** high / open (`baywue-verfassung-2025-originalblatt`). Rechtswirkung übernommen; die Quelle verbessert nur die Provenienz.

### BayWü: Verkündete Akte ohne bestimmbares Wirkdatum (Meisterpflichtgesetz, Gesetz zur Stärkung der Familiengesundheit)

- **Was fehlt:** C – Evidenz unvollständig (Wirkdatum).
- **Existenzbeleg:** Quellen liegen vor; „am Tag der Verabschiedung“ ohne Beschlussdatum bzw. keine Inkrafttretensregel.
- **Entsperrt:** 2 Ledger-Ereignisse.
- **Sicherheit / Status:** low / open (`baywue-wirkdaten`). Ein Beschlussprotokoll des Landtags könnte das Datum belegen.

### NSH: Landesverfassung Niedersachsen-Holstein (NH GVBl. MAL-I Teil 1/2024 S. 4–26)

- **Was fehlt:** C – Evidenz unvollständig (Wirkdatum, Unterschrift/Ausfertigung).
- **Existenzbeleg:** Abdruck liegt vor, aber widersprüchlich (Artikel 76 ohne Tageszahl, Ausfertigung vor dem Ausgabedatum, Artikelüberschrift eines anderen Gesetzes).
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** low / open (`nsh-landesverfassung-2024`). Nur eine amtliche Berichtigung würde helfen; ihre Existenz ist nicht belegt.

### NSH: Schulverordnungen 2026 auf Grundlage des nicht verkündeten Schulgesetzes (SchulReNeuOG)

- **Was fehlt:** C – Evidenz unvollständig (Verkündung).
- **Existenzbeleg:** Sechs Verordnungen und eine Schulordnung liegen als Einzeldokumente vor; ihre Ermächtigung (Schulgesetz) ist nur als Entwurf belegt, eine Verkündung für keine von ihnen.
- **Entsperrt:** 8 Ledger-Ereignisse.
- **Sicherheit / Status:** low / open (`nsh-schulgesetz-2026`). Existenz einer Verkündung ist nicht belegt – keine P1/P2.

### West: Verordnung zur Einführung von Grenzkontrollen (Einzelausfertigung 24-MP-02-V-01 vom 16.08.2024) und ihre Aufhebung

- **Was fehlt:** C – Evidenz unvollständig (Verkündung).
- **Existenzbeleg:** Einzelausfertigung und Blattabdruck (GV. West 2024 Nr. 04) liegen vor; der Tag der Einzelverkündung ist nicht belegt, die Datierungen widersprechen sich.
- **Entsperrt:** 2 Ledger-Ereignisse.
- **Sicherheit / Status:** medium / open (`west-grenzkontrollen-2024`).

### West: Haushaltsplan 2024 (Anlage zum Haushaltsgesetz, GV. West 2024 Nr. 3 S. 77)

- **Was fehlt:** C – Evidenz unvollständig (Anlage, Wirkdatum).
- **Existenzbeleg:** Das Haushaltsgesetz verweist auf den Haushaltsplan als Anlage; die Anlage ist nicht abgedruckt, das Inkrafttreten nennt keinen Tag.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** medium / open (`west-haushalt-2024-anlage`).

### West: Verfassung für Westdeutschland vom 23.02.2024 – Ausfertigung und Volksabstimmung

- **Was fehlt:** C – Evidenz unvollständig (Unterschrift/Ausfertigung, Verkündung, Wirkdatum).
- **Existenzbeleg:** Abdruck in GV. West 2024 Nr. 1 ohne Ausfertigungsformel und Unterschrift; Inkrafttreten an eine Volksabstimmung geknüpft, deren Ergebnis nicht belegt ist.
- **Entsperrt:** 1 Ledger-Ereignis.
- **Sicherheit / Status:** low / open (`west-verfassung-2024`). Ob die Volksabstimmung stattfand, ist offen; die Ausgabe vom 01.10.2024 verkündet eine neue Verfassung ohne Bezug.

