# Barrierefreiheits-Smoke – https://landesrecht.xyungeloestlp.workers.dev

Statische HTML-Prüfung (scripts/lib/html-audit.ts): Überschriftenhierarchie, Landmarks, Sprunglink, Formularbeschriftungen, Tabellen (Kopfzellen, Container, Spaltenzahl), Linktexte/-ziele, ARIA-Referenzen, aria-current, tabindex, Bilder. Kein Browser, keine Kontrast-/Fokusprüfung im Rendering.
Geprüfte Seiten: 33 (Start, Länderseite mit Filtern, Suche, Normseiten, Unterseiten, Fehlerseiten).

## Befunde nach Code

| Code | Schwere | Seiten | Beispiel |
| --- | --- | --- | --- |
| duplicate-id | error | 2: norm-most-tables, norm-most-warnings | 6 doppelte id-Werte |
| table-no-header-cells | warning | 6: norm-without-abbr, norm-longest, norm-most-annexes, norm-most-warnings, norm-reference, version-reference | 8 von 8 Tabellen ohne Kopfzellen (<th>) |

## Überschriftenstruktur je Seite (Auszug)

### start (/)

- h1 Landesrecht
- h2 Gemeinsame Suche
- h2 Länder
- h3 Land Westdeutschland
- h3 Land Niedersachsen-Holstein
- h3 Freistaat Ostdeutschland
- h3 Freistaat Bayern-Württemberg

Befunde: keine

### west (/west/)

- h1 Land Westdeutschland
- h2 Vorhandene Normen (1423)
- h3 §§ 14a und 14c des Gesetzes zur Förderung der gese
- h3 Abgabe von Unterlagen an das Landesarchiv West Run
- h3 Abgeordnetengesetz des Landes Westdeutschland
- h3 Abnahme von baulichen Maßnahmen bei Ingenieurbauwe
- h3 Abschlagszahlung auf die zu erwartende einmalige C
- h3 Allgemeine Anlagerichtlinien für die Verwaltung vo
- h3 Allgemeine Erlaubnis für Kleine Lotterien und Auss
- h3 Allgemeine Erlaubnis für kleine Lotterien und Auss
- h3 Allgemeine Externen-Prüfungsordnung für Bildungsgä
- h3 Allgemeine Richtlinie zur Förderung von Projekten 

Befunde: keine

### west-type-gesetz (/west/?type=gesetz)

- h1 Land Westdeutschland
- h2 Vorhandene Normen (1423)
- h3 §§ 14a und 14c des Gesetzes zur Förderung der gese
- h3 Abgeordnetengesetz des Landes Westdeutschland
- h3 Allgemeines Berggesetz
- h3 Ausführungsgesetz des Landes Westdeutschland zum S
- h3 Ausführungsgesetz zu § 47 Absatz 1b des Asylgesetz
- h3 Ausführungsgesetz zum Bundesausbildungsförderungsg
- h3 Ausführungsgesetz zum Bürgerlichen Gesetzbuch
- h3 Ausführungsgesetz zum Flurbereinigungsgesetz
- h3 Ausführungsgesetz zum Gerichtsverfassungsgesetz
- h3 Ausführungsgesetz zum Grundstückverkehrsgesetz

Befunde: keine

### west-type-verordnung (/west/?type=verordnung)

- h1 Land Westdeutschland
- h2 Vorhandene Normen (1423)
- h3 Allgemeine Externen-Prüfungsordnung für Bildungsgä
- h3 Ausbildungs- und Prüfungsordnung für Desinfektorin
- h3 Ausbildungs- und Prüfungsordnung für Familienpfleg
- h3 Ausbildungs- und Prüfungsordnung für Hygienekontro
- h3 Ausbildungs- und Prüfungsordnung für sozialmedizin
- h3 Ausbildungs- und Prüfungsverordnung für den Beruf 
- h3 Ausbildungs- und Prüfungsverordnung für Rettungssa
- h3 Ausführungsverordnung zum Gesetz zur Ausführung de
- h3 Ausführungsverordnung zur Verordnung über die Zust
- h3 Beflaggungsverordnung

Befunde: keine

### west-type-verwaltungsvorschrift (/west/?type=verwaltungsvorschrift)

- h1 Land Westdeutschland
- h2 Vorhandene Normen (1423)
- h3 Abgabe von Unterlagen an das Landesarchiv West Run
- h3 Abnahme von baulichen Maßnahmen bei Ingenieurbauwe
- h3 Abschlagszahlung auf die zu erwartende einmalige C
- h3 Allgemeine Anlagerichtlinien für die Verwaltung vo
- h3 Allgemeine Erlaubnis für Kleine Lotterien und Auss
- h3 Allgemeine Erlaubnis für kleine Lotterien und Auss
- h3 Allgemeine Richtlinie zur Förderung von Projekten 
- h3 Allgemeine Verwaltungsvorschrift zu § 74 Absatz 4 
- h3 Allgemeine Verwaltungsvorschriften zum Landesreise
- h3 Anweisungen über die Verwaltung und Organisation d

Befunde: keine

### west-type-runderlass (/west/?type=runderlass)

- h1 Land Westdeutschland
- h2 Vorhandene Normen (1423)
- h3 Abgabe von Unterlagen an das Landesarchiv West Run
- h3 Abnahme von baulichen Maßnahmen bei Ingenieurbauwe
- h3 Abschlagszahlung auf die zu erwartende einmalige C
- h3 Allgemeine Erlaubnis für kleine Lotterien und Auss
- h3 Anweisungen über die Verwaltung und Organisation d
- h3 Aufgaben des Instituts der Feuerwehr West als tech
- h3 Ausbildung hauptberuflicher Feuerwehrangehöriger z
- h3 Ausübung der Befugnisse im Rechtshilfeverkehr mit 
- h3 Benennung der Mitglieder des Verwaltungsrats des M
- h3 Berufskolleg - Unterricht in Justizvollzugsanstalt

Befunde: keine

### search-empty (/suche/)

- h1 Rechtssuche

Befunde: keine

### search-first (/suche/?q=gesetz&jurisdiction=west)

- h1 Rechtssuche
- h2 1287 Treffer für „gesetz“
- h3 Gesetz zur Ausführung des Gesetzes über die psycho
- h3 Gesetz zur kommunalen Neugliederung des Raumes Bon
- h3 Gesetz zur Wiederherstellung der Selbständigkeit d
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz über die Stiftung für Hochschulzulassung

Befunde: keine

### search-type (/suche/?q=gesetz&jurisdiction=west&type=verordnung)

- h1 Rechtssuche
- h2 667 Treffer für „gesetz“
- h3 Verordnung zur Durchführung des Gesetzes zur Regel
- h3 Durchführungsverordnung zum Gesetz über die Öffent
- h3 Verordnung zur Durchführung des Gesetzes über die 
- h3 Verordnung zur Durchführung des Gesetzes über die 
- h3 Verordnung zur Übertragung von Zuständigkeiten nac
- h3 Verordnung über Zuständigkeiten nach dem Gesetz zu
- h3 Verordnung zur Durchführung des Gesetzes über das 
- h3 Verordnung zur Durchführung des Wirtschafts-Portal
- h3 Verordnung zur Durchführung von Aufgaben nach dem 
- h3 Verordnung zur Ausführung des Gesetzes über die De

Befunde: keine

### search-filter-only (/suche/?jurisdiction=west&type=verwaltungsvorschrift)

- h1 Rechtssuche
- h2 198 Treffer
- h3 Abgabe von Unterlagen an das Landesarchiv West Run
- h3 Abnahme von baulichen Maßnahmen bei Ingenieurbauwe
- h3 Abschlagszahlung auf die zu erwartende einmalige C
- h3 Allgemeine Anlagerichtlinien für die Verwaltung vo
- h3 Allgemeine Erlaubnis für Kleine Lotterien und Auss
- h3 Allgemeine Erlaubnis für kleine Lotterien und Auss
- h3 Allgemeine Richtlinie zur Förderung von Projekten 
- h3 Allgemeine Verwaltungsvorschrift zu § 74 Absatz 4 
- h3 Allgemeine Verwaltungsvorschriften zum Landesreise
- h3 Anweisungen über die Verwaltung und Organisation d

Befunde: keine

### search-structural (/suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west)

- h1 Rechtssuche
- h2 2 Treffer für „§ 3 Absatz 2 LHundG“
- h3 Hundegesetz für das Land Westdeutschland
- h3 Ordnungsbehördliche Verordnung zur Durchführung de

Befunde: keine

### search-nohit (/suche/?q=xyzzyqwertz&jurisdiction=west)

- h1 Rechtssuche
- h2 0 Treffer für „xyzzyqwertz“

Befunde: keine

### norm-without-abbr (/west/norm/3-rundfunkaenderungsgesetz-west/)

- h1 Gesetz zur Zuordnung von Übertragungskapazitäten u
- h2 Inhaltsübersicht
- h2 Normtext
- h3 Artikel 1
- h3 Artikel 2Zuweisung von Übertragungskapazitäten
- h3 Artikel 3
- h3 Quellhinweise
- h2 Fassungen und Änderungen
- h2 Zitieren
- h2 Quellen

Befunde: warning table-no-header-cells (Tabelle 0)

### norm-longest (/west/norm/sbauvo-west/)

- h1 Verordnung über Bau und Betrieb von Sonderbauten *
- h2 Inhaltsübersicht
- h2 Normtext
- h3 Teil 1Versammlungsstätten
- h4 Kapitel 1Allgemeine Vorschriften für Versammlungss
- h4 Kapitel 2Allgemeine Bauvorschriften für Versammlun
- h5 Abschnitt 1Bauteile und Baustoffe von Versammlungs
- h5 Abschnitt 2Rettungswege von Versammlungsstätten
- h5 Abschnitt 3Besucherplätze und Einrichtungen für Be
- h5 Abschnitt 4Technische Anlagen und Einrichtungen, b
- h4 Kapitel 3Besondere Bauvorschriften für Versammlung
- h5 Abschnitt 1Großbühnen

Befunde: warning table-no-header-cells (Tabelle 0)

### norm-administrative (/west/norm/zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west/)

- h1 Zulassung von Fachverfahren zur automatisierten Au
- h2 Inhaltsübersicht
- h2 Normtext
- h3 1Anwendungsbereich
- h3 2Teil 1: Allgemeine Anforderungen an Fachverfahren
- h4 2.1Abbildung von Sachverhalten und Geschäftsvorfäl
- h5 2.1.1
- h5 2.1.2
- h5 2.1.3
- h5 2.1.4
- h5 2.1.5
- h5 2.1.6

Befunde: keine

### norm-reconstructed (/west/norm/vv-lhundg-west/)

- h1 Verwaltungsvorschriften zum Landeshundegesetz
- h2 Inhaltsübersicht
- h2 Normtext
- h3 I.Allgemeiner Teil
- h4 1
- h4 2
- h4 3
- h4 4
- h4 5
- h3 II.Besonderer Teil
- h4 1Zu § 1 (Zweck des Gesetzes)
- h4 2Zu § 2 (Allgemeine Pflichten)

Befunde: keine

### norm-most-tables (/west/norm/lostv-west/)

- h1 Gesetz zu dem Staatsvertrag zum Lotteriewesen in D
- h2 Inhaltsübersicht
- h2 Normtext
- h3 Artikel 1
- h3 Artikel 2
- h3 Artikel 3
- h3 Anlage (Staatsvertag zum Lotteriewesen...) (HTM)
- h3 Anlage (Staatsvertrag über die Regionalisierung..)
- h3 Quellhinweise
- h2 Fassungen und Änderungen
- h2 Zitieren
- h2 Quellen

Befunde: error duplicate-id (anlage-staatsvertag-zum-lotteriewesen-htm-abs-1)

### norm-most-annexes (/west/norm/vermgebo-west/)

- h1 Gebührenordnung für die Vermessungs- und Katasterb
- h2 Inhaltsübersicht
- h2 Normtext
- h3 § 1Anwendungsbereich
- h3 § 2Befreiung und Ermäßigung
- h3 § 3MehrarbeitNacht-, Sonn- und Feiertagsarbeit
- h3 § 4Umsatzsteuer
- h3 § 5Auslagen
- h3 § 6Sonderregelungen
- h3 § 7In-Kraft-Treten, Außer-Kraft-Treten, Übergangsr
- h3 Anlage/Inhaltsübersicht (HTM)
- h3 Tarifstellen 1 bis 2.3.6.2 (HTM)

Befunde: warning table-no-header-cells (Tabelle 0)

### norm-most-warnings (/west/norm/gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west/)

- h1 Gesetz über die Fachhochschulen für den öffentlich
- h2 Inhaltsübersicht
- h2 Normtext
- h3 Erster AbschnittRechtsstellung und Aufgaben der Fa
- h3 Zweiter AbschnittMitgliedschaft und Mitwirkung
- h3 Dritter AbschnittAufbau und Organisation
- h3 Vierter AbschnittDas Hochschulpersonal
- h3 Fünfter AbschnittStudierende, Studium und Prüfung,
- h3 Sechster AbschnittForschung an der Fachhochschule 
- h3 Siebter AbschnittHaushaltswesen an der Fachhochsch
- h3 Achter AbschnittBeiräte, Aufsicht
- h3 Neunter AbschnittZusammenwirken der Fachhochschule

Befunde: error duplicate-id (anlage-anhang-htm-abs-1); warning table-no-header-cells (Tabelle 0)

### norm-reference (/west/norm/lhundg-west/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Inhaltsübersicht
- h2 Normtext
- h3 § 1Zweck des Gesetzes
- h3 § 2Allgemeine Pflichten
- h3 § 3Gefährliche Hunde
- h3 § 4Erlaubnis
- h3 § 5Pflichten
- h3 § 6Sachkunde
- h3 § 7Zuverlässigkeit
- h3 § 8Anzeige- und Mitteilungspflichten
- h3 § 9Zucht-, Kreuzungs- und Handelsverbot, Unfruchtb

Befunde: warning table-no-header-cells (Tabelle 0)

### sources-reconstructed (/west/norm/vv-lhundg-west/quellen/)

- h1 Verwaltungsvorschriften zum Landeshundegesetz
- h2 Quellen der Fassung 2023-12-01
- h2 Quellen der Norm

Befunde: keine

### sources-reference (/west/norm/lhundg-west/quellen/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Quellen der Fassung 2023-12-01
- h2 Quellen der Norm

Befunde: keine

### facts-reference (/west/norm/lhundg-west/daten/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Vorschriftendaten
- h2 Fassung 2023-12-01
- h2 Beziehungen
- h3 Externe Kennungen

Befunde: keine

### history-reference (/west/norm/lhundg-west/historie/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Gespeicherte Fassungen
- h2 Änderungen und Hinweise

Befunde: keine

### compare-reference (/west/norm/lhundg-west/vergleich/)

- h1 Hundegesetz für das Land Westdeutschland

Befunde: keine

### version-reference (/west/norm/lhundg-west/version/2023-12-01/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Inhaltsübersicht
- h2 Normtext
- h3 § 1Zweck des Gesetzes
- h3 § 2Allgemeine Pflichten
- h3 § 3Gefährliche Hunde
- h3 § 4Erlaubnis
- h3 § 5Pflichten
- h3 § 6Sachkunde
- h3 § 7Zuverlässigkeit
- h3 § 8Anzeige- und Mitteilungspflichten
- h3 § 9Zucht-, Kreuzungs- und Handelsverbot, Unfruchtb

Befunde: warning table-no-header-cells (Tabelle 0)

### help (/hilfe/)

- h1 Hilfe
- h2 Was ist dieses Portal?
- h2 Ausgangsrechtsstand und Fassungen
- h2 Suche
- h2 Adressen

Befunde: keine

### imprint (/impressum/)

- h1 Impressum

Befunde: keine

### not-found-norm (/west/norm/diese-norm-gibt-es-nicht/)

- h1 Seite nicht gefunden

Befunde: keine

### not-found-jurisdiction (/nirgendwo/)

- h1 Seite nicht gefunden

Befunde: keine

### not-found-version (/west/norm/lhundg-west/version/1999-01-01/)

- h1 Seite nicht gefunden

Befunde: keine

### search-middle (/suche/?q=gesetz&jurisdiction=west&offset=640)

- h1 Rechtssuche
- h2 1287 Treffer für „gesetz“
- h3 Zweites bis Fünftes Gesetz zur Befristung des Land
- h3 Gesetz über die Errichtung des Landesamtes für Fin
- h3 Gesetz zu dem Vertrage des Landes Westdeutschland 
- h3 Gesetz zur Regelung der Dienstaufsicht über die Be
- h3 Gesetz über den Europäischen Berufsausweis
- h3 Gesetz über den Landesverband Lippe
- h3 Gesetz über den Zusammenschluß der Gemeinden des A
- h3 Gesetz über den Zusammenschluß der Stadt Heimbach 
- h3 Gesetz über die Eingliederung der Gemeinde Marienl
- h3 Gesetz über die Eingliederung der Gemeinde Wewer, 

Befunde: keine

### search-last (/suche/?q=gesetz&jurisdiction=west&offset=1280)

- h1 Rechtssuche
- h2 1287 Treffer für „gesetz“
- h3 Nichtraucherschutz in Diensträumen
- h3 Beschaffung von Leistungen zum Zweck der Unterbrin
- h3 Prüfungsordnung für die Durchführung von Abschluss
- h3 Übermittlungssperren gemäß § 41 des Straßenverkehr
- h3 Beschaffung von Leistungen zum Zweck der Unterbrin
- h3 Verwaltungsvereinbarung zur Errichtung des „Promot
- h3 Fortbildungsprüfungsordnung zur Fachwirtin/zum Fac

Befunde: keine
