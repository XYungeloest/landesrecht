# Barrierefreiheits-Smoke – https://landesrecht-online.de

Statische HTML-Prüfung (scripts/lib/html-audit.ts): Überschriftenhierarchie, Landmarks, Sprunglink, Formularbeschriftungen, Tabellen (Kopfzellen, Container, Spaltenzahl), Linktexte/-ziele, ARIA-Referenzen, aria-current, tabindex, Bilder. Kein Browser, keine Kontrast-/Fokusprüfung im Rendering.
Geprüfte Seiten: 38 (Start, Länderseite mit Filtern, Suche, Normseiten, Unterseiten, Fehlerseiten).

## Befunde nach Code

| Code | Schwere | Seiten | Beispiel |
| --- | --- | --- | --- |
| table-no-header-cells | warning | 5: norm-without-abbr, norm-most-annexes, norm-most-warnings, norm-reference, version-reference | 8 von 8 Tabellen ohne Kopfzellen (<th>) |

## Überschriftenstruktur je Seite (Auszug)

### start (/)

- h1 Landesrecht durchsuchen
- h2 Länder
- h3 Land Westdeutschland
- h3 Land Niedersachsen-Holstein
- h3 Freistaat Ostdeutschland
- h3 Freistaat Bayern-Württemberg
- h2 76 Vorschriften in der Simulation geändert
- h3 Zuletzt in der Simulation geändert
- h3 Neu in der Simulation
- h2 Letzte Verkündungen
- h2 Verfassungen

Befunde: keine

### west (/west/)

- h1 Land Westdeutschland
- h2 Vorschriften
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

### west-changed (/west/?stand=changed)

- h1 Land Westdeutschland
- h2 Vorschriften
- h3 Gesetz zur Weiterentwicklung des Landespflegerecht
- h3 Gesetz über die Beamtinnen und Beamten des Landes 
- h3 Gesetz zum Schutz der Natur in Westdeutschland
- h3 Gesetz zur Ausführung des Asylbewerberleistungsges
- h3 Verordnung zur Festlegung des Anwendungsbereichs b
- h3 Allgemeine Richtlinie zur Förderung von Projekten 
- h3 Gesetz über den Brandschutz, die Hilfeleistung und
- h3 Verordnung über den Betrieb und die Ausgestaltung 
- h3 Verordnung zur Durchführung des Weinrechts
- h2 Verkündungen

Befunde: keine

### west-new (/west/?stand=new)

- h1 Land Westdeutschland
- h2 Vorschriften
- h3 Gesetz zur Einführung eines westdeutschen Standort
- h3 Gesetz zur Einführung eines westdeutschen Unterneh
- h3 Gesetz zur Förderung der Jugendbeteiligung in den 
- h3 Gesetz zur Modernisierung der westdeutschen Landes
- h3 Runderlass zur Trauerbeflaggung anlässlich des Tod
- h3 Gesetz zur Einführung des Westdeutschen Landesgesu
- h3 Landesgesundheitsgesetz
- h3 Gesetz zur Änderung der Landesverfassung
- h3 Gesetz zur Änderung des Gesetzes zur Ausführung de
- h3 Gesetz zur Beamtenlaufbahnbestimmung

Befunde: keine

### west-type-gesetz (/west/?type=gesetz)

- h1 Land Westdeutschland
- h2 Vorschriften
- h3 §§ 14a und 14c des Gesetzes zur Förderung der gese
- h3 Abgeordnetengesetz des Landes Westdeutschland
- h3 Allgemeines Berggesetz
- h3 Ausführungsgesetz des Landes Westdeutschland zum S
- h3 Ausführungsgesetz zu § 47 Absatz 1b des Asylgesetz
- h3 Ausführungsgesetz zum Bundesausbildungsförderungsg
- h3 Ausführungsgesetz zum Bürgerlichen Gesetzbuch
- h3 Ausführungsgesetz zum Bürgerlichen Gesetzbuch
- h3 Ausführungsgesetz zum Flurbereinigungsgesetz
- h3 Ausführungsgesetz zum Gerichtsverfassungsgesetz

Befunde: keine

### west-type-verordnung (/west/?type=verordnung)

- h1 Land Westdeutschland
- h2 Vorschriften
- h3 Allgemeine Externen-Prüfungsordnung für Bildungsgä
- h3 Allgemeine Verwaltungsgebührenordnung für das Land
- h3 Ausbildungs- und Prüfungsordnung für Desinfektorin
- h3 Ausbildungs- und Prüfungsordnung für Familienpfleg
- h3 Ausbildungs- und Prüfungsordnung für Hygienekontro
- h3 Ausbildungs- und Prüfungsordnung für sozialmedizin
- h3 Ausbildungs- und Prüfungsverordnung für den Beruf 
- h3 Ausbildungs- und Prüfungsverordnung für Rettungssa
- h3 Ausführungsverordnung zum Gesetz zur Ausführung de
- h3 Ausführungsverordnung zur Verordnung über die Zust

Befunde: keine

### west-type-verwaltungsvorschrift (/west/?type=verwaltungsvorschrift)

- h1 Land Westdeutschland
- h2 Vorschriften
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
- h2 Vorschriften
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

### nsh (/nsh/)

- h1 Land Niedersachsen-Holstein
- h2 Vorschriften
- h3 1. Änderung der Richtlinie zur Umsetzung des Schul
- h3 1. Änderung der Richtlinie zur Umsetzung des Schul
- h3 40. Ausführungsanweisung zum Finanzausgleichsgeset
- h3 43. Ausführungsanweisung zum Finanzausgleichsgeset
- h3 44. Ausführungsanweisung zum Finanzausgleichsgeset
- h3 45. Ausführungsanweisung zum Finanzausgleichsgeset
- h3 72. Nachtrag; Bekanntmachung des Nachtrages 72 zur
- h3 Abfallwirtschaftsgesetz für das Land Niedersachsen
- h3 Abgabe amtlicher Veröffentlichungen an Bibliotheke
- h3 Abgabe amtlicher Veröffentlichungen an Bibliotheke

Befunde: keine

### ost (/ost/)

- h1 Freistaat Ostdeutschland
- h2 Vorschriften
- h3 1. Änderung zum Programm des Ostdeutschen Staatsmi
- h3 Abkommen zur Änderung des Abkommens über die Erric
- h3 Abkommen zur Änderung des Abkommens über die Zentr
- h3 Abkommen zur Änderung des Abkommens über die Zentr
- h3 Abkommen zur Änderung des Abkommens über die Zentr
- h3 Abkommen zur Änderung des Abkommens über die Zentr
- h3 Abkommen zur Änderung des Abkommens über die Zentr
- h3 Abkommen zwischen den Ländern in der Bundesrepubli
- h3 Abkommen über die erweiterte Zuständigkeit der mit
- h3 Abkommen über die Zentralstelle der Länder für Ges

Befunde: keine

### baywue (/bayern-wuerttemberg/)

- h1 Freistaat Bayern-Württemberg
- h2 Vorschriften
- h3 15-Punkte-Programm der Bayern-Württembergischen St
- h3 2025-IMuster einer Beitrags- und Gebührensatzung z
- h3 50 Jahre Deutsch-Französischer Vertrag
- h3 Abgabe amtlicher Veröffentlichungen an Bibliotheke
- h3 Abgrenzung des Straßenbauer-Handwerks zum Garten- 
- h3 Abkommen über das Deutsche Institut für Bautechnik
- h3 Abkommen über die Deutsche Hochschule der Polizei
- h3 Abkommen über die Errichtung und Finanzierung des 
- h3 Abkommen über die erweiterte Zuständigkeit der mit
- h3 Abkommen über die erweiterte Zuständigkeit der Pol

Befunde: keine

### search-empty (/suche/)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen

Befunde: keine

### search-first (/suche/?q=gesetz&jurisdiction=west)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 1370 Treffer für „gesetz“
- h3 Gesetz zur Ausführung des Gesetzes über die psycho
- h3 Gesetz zur kommunalen Neugliederung des Raumes Bon
- h3 Gesetz zur Wiederherstellung der Selbständigkeit d
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 
- h3 Gesetz zur Neugliederung der Gemeinden und Kreise 

Befunde: keine

### search-type (/suche/?q=gesetz&jurisdiction=west&type=verordnung)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 676 Treffer für „gesetz“
- h3 Verordnung zur Durchführung des Gesetzes zur Regel
- h3 Verordnung zur Durchführung des Gesetzes über die 
- h3 Verordnung zur Durchführung des Gesetzes über die 
- h3 Durchführungsverordnung zum Gesetz über die Öffent
- h3 Verordnung zur Übertragung von Zuständigkeiten nac
- h3 Verordnung über Zuständigkeiten nach dem Gesetz zu
- h3 Verordnung zur Durchführung des Gesetzes über das 
- h3 Verordnung zur Durchführung des Wirtschafts-Portal

Befunde: keine

### search-filter-only (/suche/?jurisdiction=west&type=verwaltungsvorschrift)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 238 Treffer
- h3 Abgabe von Unterlagen an das Landesarchiv West Run
- h3 Abnahme von baulichen Maßnahmen bei Ingenieurbauwe
- h3 Abschlagszahlung auf die zu erwartende einmalige C
- h3 Allgemeine Anlagerichtlinien für die Verwaltung vo
- h3 Allgemeine Erlaubnis für Kleine Lotterien und Auss
- h3 Allgemeine Erlaubnis für kleine Lotterien und Auss
- h3 Allgemeine Richtlinie zur Förderung von Projekten 
- h3 Allgemeine Verwaltungsvorschrift zu § 74 Absatz 4 

Befunde: keine

### search-structural (/suche/?q=%C2%A7+3+Absatz+2+LHundG&jurisdiction=west)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 2 Treffer für „§ 3 Absatz 2 LHundG“
- h3 Hundegesetz für das Land Westdeutschland
- h3 Ordnungsbehördliche Verordnung zur Durchführung de

Befunde: keine

### search-nohit (/suche/?q=xyzzyqwertz&jurisdiction=west)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 0 Treffer für „xyzzyqwertz“

Befunde: keine

### norm-without-abbr (/west/norm/3-rundfunkaenderungsgesetz-west/)

- h1 Gesetz zur Zuordnung von Übertragungskapazitäten u
- h2 Normtext
- h3 Artikel 1
- h3 Artikel 2 Zuweisung von Übertragungskapazitäten
- h3 Artikel 3
- h3 Quellhinweise
- h2 Frühere Fassungen
- h2 Zitieren
- h2 Quellen und Nachweise

Befunde: warning table-no-header-cells (Tabelle 0)

### norm-longest (/west/norm/avwgebo-west/)

- h1 Allgemeine Verwaltungsgebührenordnung für das Land
- h2 Normtext
- h3 § 1 Anwendungsbereich, Abweichungsverbot
- h3 § 2 Pauschale Vorausfestsetzung bei mehrfachen Amt
- h3 § 3 Absehen aus Gründen der Billigkeit
- h3 § 4 Mindestgebühr bei Prozent- und Promillesätzen;
- h3 § 5 Amtliches Vermessungswesen und amtliche Grunds
- h3 § 6 Inkrafttreten, Außerkrafttreten
- h3 Anhang 5 zu den Tarifstellen 4.3.1.1, 4.3.1.2 und 
- h3 Anlage Tarifstellen 1 bis 14 (HTM)
- h3 Quellhinweise
- h2 Frühere Fassungen

Befunde: keine

### norm-administrative (/west/norm/zulassung-von-fachverfahren-zur-automatisierten-ausfuehrung-der-west/)

- h1 Zulassung von Fachverfahren zur automatisierten Au
- h2 Normtext
- h3 1 Anwendungsbereich
- h3 2 Teil 1: Allgemeine Anforderungen an Fachverfahre
- h4 2.1 Abbildung von Sachverhalten und Geschäftsvorfä
- h5 2.1.1
- h5 2.1.2
- h5 2.1.3
- h5 2.1.4
- h5 2.1.5
- h5 2.1.6
- h5 2.1.7

Befunde: keine

### norm-reconstructed (/west/norm/vv-lhundg-west/)

- h1 Verwaltungsvorschriften zum Landeshundegesetz
- h2 Normtext
- h3 I. Allgemeiner Teil
- h4 1
- h4 2
- h4 3
- h4 4
- h4 5
- h3 II. Besonderer Teil
- h4 1 Zu § 1 (Zweck des Gesetzes)
- h4 2 Zu § 2 (Allgemeine Pflichten)
- h5 2.1

Befunde: keine

### norm-most-tables (/west/norm/lostv-west/)

- h1 Gesetz zu dem Staatsvertrag zum Lotteriewesen in D
- h2 Normtext
- h3 Artikel 1
- h3 Artikel 2
- h3 Artikel 3
- h3 Anlage (Staatsvertag zum Lotteriewesen...) (HTM)
- h3 Anlage (Staatsvertrag über die Regionalisierung..)
- h3 Quellhinweise
- h2 Frühere Fassungen
- h2 Zitieren
- h2 Quellen und Nachweise

Befunde: keine

### norm-most-annexes (/west/norm/vermgebo-west/)

- h1 Gebührenordnung für die Vermessungs- und Katasterb
- h2 Normtext
- h3 § 1 Anwendungsbereich
- h3 § 2 Befreiung und Ermäßigung
- h3 § 3 MehrarbeitNacht-, Sonn- und Feiertagsarbeit
- h3 § 4 Umsatzsteuer
- h3 § 5 Auslagen
- h3 § 6 Sonderregelungen
- h3 § 7 In-Kraft-Treten, Außer-Kraft-Treten, Übergangs
- h3 Anlage/Inhaltsübersicht (HTM)
- h3 Tarifstellen 1 bis 2.3.6.2 (HTM)
- h3 Tarifstellen 2.4 bis 3.4 (HTM)

Befunde: warning table-no-header-cells (Tabelle 0)

### norm-most-warnings (/west/norm/gesetz-ueber-die-fachhochschulen-fuer-den-oeffentlichen-dienst-im-lande-west/)

- h1 Gesetz über die Fachhochschulen für den öffentlich
- h2 Normtext
- h3 Erster Abschnitt Rechtsstellung und Aufgaben der F
- h3 Zweiter Abschnitt Mitgliedschaft und Mitwirkung
- h3 Dritter Abschnitt Aufbau und Organisation
- h3 Vierter Abschnitt Das Hochschulpersonal
- h3 Fünfter Abschnitt Studierende, Studium und Prüfung
- h3 Sechster Abschnitt Forschung an der Fachhochschule
- h3 Siebter Abschnitt Haushaltswesen an der Fachhochsc
- h3 Achter Abschnitt Beiräte, Aufsicht
- h3 Neunter Abschnitt Zusammenwirken der Fachhochschul
- h3 Zehnter Abschnitt Übergangsbestimmungen

Befunde: warning table-no-header-cells (Tabelle 0)

### norm-reference (/west/norm/lhundg-west/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Normtext
- h3 § 1 Zweck des Gesetzes
- h3 § 2 Allgemeine Pflichten
- h3 § 3 Gefährliche Hunde
- h3 § 4 Erlaubnis
- h3 § 5 Pflichten
- h3 § 6 Sachkunde
- h3 § 7 Zuverlässigkeit
- h3 § 8 Anzeige- und Mitteilungspflichten
- h3 § 9 Zucht-, Kreuzungs- und Handelsverbot, Unfrucht
- h3 § 10 Hunde bestimmter Rassen

Befunde: warning table-no-header-cells (Tabelle 0)

### sources-reconstructed (/west/norm/vv-lhundg-west/quellen/)

- h1 Verwaltungsvorschriften zum Landeshundegesetz
- h2 Herkunft dieser Fassung

Befunde: keine

### sources-reference (/west/norm/lhundg-west/quellen/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Herkunft dieser Fassung

Befunde: keine

### facts-reference (/west/norm/lhundg-west/daten/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Vorschriftendaten
- h2 Diese Fassung
- h2 Beziehungen

Befunde: keine

### history-reference (/west/norm/lhundg-west/historie/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Änderungen seit dem Ausgangsstand
- h3 Fassung vom 1. Dezember 2023 (Ausgangsrechtsstand)

Befunde: keine

### compare-reference (/west/norm/lhundg-west/vergleich/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Änderungen seit dem Ausgangsstand

Befunde: keine

### version-reference (/west/norm/lhundg-west/version/2023-12-01/)

- h1 Hundegesetz für das Land Westdeutschland
- h2 Normtext
- h3 § 1 Zweck des Gesetzes
- h3 § 2 Allgemeine Pflichten
- h3 § 3 Gefährliche Hunde
- h3 § 4 Erlaubnis
- h3 § 5 Pflichten
- h3 § 6 Sachkunde
- h3 § 7 Zuverlässigkeit
- h3 § 8 Anzeige- und Mitteilungspflichten
- h3 § 9 Zucht-, Kreuzungs- und Handelsverbot, Unfrucht
- h3 § 10 Hunde bestimmter Rassen

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

### search-middle (/suche/?q=gesetz&jurisdiction=west&offset=680)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 1370 Treffer für „gesetz“
- h3 Verordnung über die Ausbildung und Prüfung für die
- h3 Verordnung über die Schiedsstellen nach § 78 g SGB
- h3 Verordnung über weitere polizeiliche Aufgaben des 
- h3 Verordnung zum Landesfischereigesetz
- h3 Richtlinie über die Gewährung von Billigkeitsleist
- h3 Verordnung über die Laufbahnen der Beamtinnen und 
- h3 Richtlinien über die Gewährung von Zuwendungen für
- h3 Verordnung über die Festsetzung des Lärmschutzbere

Befunde: keine

### search-last (/suche/?q=gesetz&jurisdiction=west&offset=1360)

- h1 Rechtssuche
- h2 Suche eingrenzen
- h2 Suche eingrenzen
- h2 1370 Treffer für „gesetz“
- h3 Nichtraucherschutz in Diensträumen
- h3 Beschaffung von Leistungen zum Zweck der Unterbrin
- h3 Prüfungsordnung für die Durchführung von Abschluss
- h3 Übermittlungssperren gemäß § 41 des Straßenverkehr
- h3 Beschaffung von Leistungen zum Zweck der Unterbrin
- h3 Richtlinie über die Gewährung von Zuwendungen zur 
- h3 Verwaltungsvereinbarung zur Errichtung des „Promot
- h3 Fortbildungsprüfungsordnung zur Fachwirtin/zum Fac

Befunde: keine
