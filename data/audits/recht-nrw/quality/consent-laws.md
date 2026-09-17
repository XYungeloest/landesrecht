# Zustimmungsgesetze (Staatsverträge) – Audit

Erzeugt mit `npm run audit:consent-laws` -- --online. Offline: alle im Manifest erkannten Zustimmungsgesetze
(`consentLaw.detected`) gegen den Bestand `content/norms/west/`: Titel (Rest der Quell-Landesbezeichnung?), Zustimmungsformel
im Text, Normtyp, Ort des Vertragstexts, Anlagen/Tabellen/PDF. Online: deterministische Stichprobe (Seed 20231201) der Normseiten,
Länderseite mit Typfilter und Such-API mit Typfilter. Nur Befund, keine Änderung.

## Ergebnis

| Kennzahl | Wert |
| --- | --- |
| Zustimmungsgesetze laut Manifest | 15 |
| Normen mit Typ `zustimmungsgesetz` im Bestand | 15 |
| Zustimmungsformel im Text erkannt | 15 / 15 |
| Titel mit Rest der Quell-Landesbezeichnung | 0 |
| mit Abkürzung | 2 |
| Klassifikation | vertragstext-extern 10, vollständig 5 |
| Ort des Vertragstexts | html-annex 2, inline 1, pdf-attachment 7, unknown 5 |

Klassifikation: `vollständig` = Typ, Formel und Vertragstext (HTML-Anlage oder inline) vorhanden; `vertragstext-extern` = Zustimmungs-
gesetz vollständig, Vertragstext nur als PDF-Anlage bzw. nicht im HTML (Quellenlage RECHT.NRW, kein Importfehler – Anlage ist
archiviert und auf der Quellenseite verlinkt); `formel-fehlt` = keine Formel im Text erkannt (Einordnung beruht auf Titel und
Erkennungsbelegen); `typ-abweichend` = Normtyp weicht ab (Prüfbedarf).

## Alle Zustimmungsgesetze (15)

| Norm | Abk. | Typ | Formel | Vertragstext | Anlagen | Tabellen | PDF | Klassifikation | Hinweis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gesetz-zu-dem-staatsvertrag-zwischen-dem-land-rheinland-pfalz-und-dem-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 1 | vertragstext-extern | Vertragstext nur als PDF-Anlage (1 PDF, html-with-pdf-attachments) |
| gesetz-zu-dem-vertrag-des-landes-westdeutschland-mit-der-lippischen-west |  | zustimmungsgesetz | ja | unknown | 1 | 1 | 0 | vollständig | Formel im Gesetzestext, Typ zustimmungsgesetz |
| gesetz-zu-dem-vertrag-zwischen-dem-land-westdeutschland-und-der-west |  | zustimmungsgesetz | ja | unknown | 0 | 9 | 0 | vertragstext-extern | Vertragstext nicht im HTML enthalten (Ort unbekannt) |
| gesetz-zum-dritten-staatsvertrag-zwischen-den-laendern-niedersachsen-und-west |  | zustimmungsgesetz | ja | html-annex | 1 | 1 | 1 | vollständig | Formel im Gesetzestext, Typ zustimmungsgesetz |
| gesetz-zum-fuenften-staatsvertrag-zur-aenderung-rundfunkrechtlicher-west |  | zustimmungsgesetz | ja | unknown | 0 | 0 | 0 | vertragstext-extern | Vertragstext nicht im HTML enthalten (Ort unbekannt) |
| gesetz-zum-staatsvertrag-zwischen-den-laendern-hessen-und-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 7 | vertragstext-extern | Vertragstext nur als PDF-Anlage (7 PDF, html-with-pdf-attachments) |
| gesetz-zum-zweiten-staatsvertrag-zwischen-den-laendern-niedersachsen-und-west |  | zustimmungsgesetz | ja | inline | 1 | 0 | 0 | vollständig | Formel im Gesetzestext, Typ zustimmungsgesetz |
| gesetz-zur-ratifizierung-des-staatsvertrages-ueber-die-errichtung-einer-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 1 | vertragstext-extern | Vertragstext nur als PDF-Anlage (1 PDF, html-with-pdf-attachments) |
| gesetz-zur-ratifizierung-des-staatsvertrages-ueber-die-vergabe-von-west |  | zustimmungsgesetz | ja | unknown | 0 | 0 | 0 | vertragstext-extern | Vertragstext nicht im HTML enthalten (Ort unbekannt) |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-gemeinsame-einrichtung-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 1 | vertragstext-extern | Vertragstext nur als PDF-Anlage (1 PDF, html-with-pdf-attachments) |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-hochschulzulassung-vom-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 1 | vertragstext-extern | Vertragstext nur als PDF-Anlage (1 PDF, html-with-pdf-attachments) |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-organisation-eines-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 1 | vertragstext-extern | Vertragstext nur als PDF-Anlage (1 PDF, html-with-pdf-attachments) |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-vereinigung-der-lbs-west |  | zustimmungsgesetz | ja | pdf-attachment | 0 | 0 | 1 | vertragstext-extern | Vertragstext nur als PDF-Anlage (1 PDF, html-with-pdf-attachments) |
| jmstv-west | JMStV | zustimmungsgesetz | ja | unknown | 1 | 1 | 0 | vollständig | Formel im Gesetzestext, Typ zustimmungsgesetz |
| lostv-west | LoStV | zustimmungsgesetz | ja | html-annex | 2 | 32 | 0 | vollständig | Formel im Gesetzestext, Typ zustimmungsgesetz |

## Stichprobe online (5)

Basis `https://landesrecht.xyungeloestlp.workers.dev`.

| Norm | HTTP | ms | h1 | Titel ok | Typ sichtbar | Formel gerendert | Anlagen-Überschriften | Tabellen | doppelte ids | Befunde |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gesetz-zur-ratifizierung-des-staatsvertrages-ueber-die-vergabe-von-west | 200 | 409 | Gesetz zur Ratifizierung des Staatsvertrages über die Vergabe von Studienplätzen vom 22. Juni 2006 | ja | ja | ja | 0 | 0 | 0 |  |
| gesetz-zum-zweiten-staatsvertrag-zwischen-den-laendern-niedersachsen-und-west | 200 | 110 | Gesetz zum Zweiten Staatsvertrag zwischen den Ländern Niedersachsen und Westdeutschland über Änderungen der gemeinsamen  | ja | ja | ja | 1 | 0 | 0 |  |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-organisation-eines-west | 200 | 108 | Gesetz zur Zustimmung zum Staatsvertrag über die Organisation eines gemeinsamen Akkreditierungssystems zur Qualitätssich | ja | ja | ja | 0 | 0 | 0 |  |
| gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-gemeinsame-einrichtung-west | 200 | 106 | Gesetz zur Zustimmung zum Staatsvertrag über die gemeinsame Einrichtung für Hochschulzulassung vom 21. März 2016 | ja | ja | ja | 0 | 0 | 0 |  |
| lostv-west | 200 | 118 | Gesetz zu dem Staatsvertrag zum Lotteriewesen in Deutschland und dem Staatsvertrag über die Regionalisierung von Teilen  | ja | ja | ja | 2 | 32 | 0 |  |

Länderseite mit Typfilter: `https://landesrecht.xyungeloestlp.workers.dev/west/?type=zustimmungsgesetz` → HTTP 200, Zählung „15 von … Normen“, 15 Listeneinträge (erwartet 15) – ok.

Such-API mit Typfilter: `https://landesrecht.xyungeloestlp.workers.dev/api/v1/search?q=Staatsvertrag&jurisdiction=west&type=zustimmungsgesetz&limit=50` → HTTP 200, 13 Treffer, nur Typ zustimmungsgesetz: ja;
Stichprobe gefunden: gesetz-zur-ratifizierung-des-staatsvertrages-ueber-die-vergabe-von-west, gesetz-zum-zweiten-staatsvertrag-zwischen-den-laendern-niedersachsen-und-west, gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-organisation-eines-west, gesetz-zur-zustimmung-zum-staatsvertrag-ueber-die-gemeinsame-einrichtung-west, lostv-west.
