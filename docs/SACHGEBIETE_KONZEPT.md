# Gemeinsame Sachgebiete: Daten und Laufzeit

## Taxonomie

Die gemeinsame redaktionelle Orientierung liegt in `data/editorial/subjects/taxonomy.json`.
Sie übernimmt die genauen acht Hauptgruppen, Beschreibungen und 56 Untergruppen aus
`../staatsregierung/packages/shared/src/config/law-subjects.json`. Hauptgruppen haben stabile
sprechende IDs unabhängig von ihrem Anzeigetext; Untergruppen bleiben als belegte Quelltaxonomie
erhalten. Öffentlich navigiert die erste Ausbaustufe über die acht Hauptgruppen, ohne Codes.
Dies ist keine behauptete amtliche Einheitsklassifikation der vier Länder.

| Stabile ID | Öffentliche Bezeichnung |
| --- | --- |
| staat-verfassung | Staats- und Verfassungsrecht |
| verwaltung | Verwaltung |
| justiz | Rechtspflege, Zivilrecht und Strafrecht |
| planung-verkehr | Landesplanung, Baurecht, Wohnungen, Verkehr |
| finanzen | Finanzwesen |
| wirtschaft-umwelt | Wirtschaftsrecht, Landwirtschaft, Umweltrecht |
| bildung-kultur | Kulturelle Angelegenheiten |
| soziales | Sozialwesen |

## Quellen und Grenzen der Übersetzung

- **Ost:** `crosswalks/ost.json` enthält 56 exakte Zuordnungen der bekannten OstRecht-Sachgebietstitel
  in ihre jeweilige Hauptgruppe. Grundlage sind die Quellkonfiguration und die vorhandenen
  `subjects_json`-Angaben. Mehrere Quellsachgebiete ergeben die Vereinigungsmenge der Hauptgruppen;
  unbekannte Werte bleiben unzugeordnet. Es gibt keine dauerhaften Ost-Normzuordnungen und keine Ost-Kopie.
- **NSH:** `crosswalks/sh.json` trennt Gesetze/Verordnungen/Verträge von der Familie der
  Verwaltungsvorschriften. Belege sind die amtliche
  [Systematische Übersicht GVOBl.](https://verkuendungsportal.schleswig-holstein.de/home/gvobl/gvobl-service/_documents/gvobl_service_systematische_uebersicht.pdf?__blob=publicationFile&v=2)
  und die getrennte
  [Systematische Übersicht des Erlassverzeichnisses](https://verkuendungsportal.schleswig-holstein.de/home/amtsblatt/ab_service/ab_service_dokumente/ab_systematische_%C3%BCbersicht.pdf?__blob=publicationFile&v=1).
  Beispielsweise wird der Bildungsbereich 223 nach Bildung/Kultur übersetzt; Schulbau 2134 im
  Verwaltungsvorschriftenplan dagegen nach Planung/Baurecht. Die gemischten Bereiche 21, 24/25,
  66 und 71/72 werden nicht pauschal übersetzt. Der Kulturschutz-Zweig 224 bleibt offen, weil er
  Denkmalschutz berührt, den die gemeinsame Taxonomie im Bereich Planung/Baurecht führt.
  Nichtnumerische Kennungen wie `B …` bleiben ebenfalls offen. Die aktuellen Quellen dienen nur
  der begrifflichen Systematik, nicht der Übernahme nachträglicher Rechtsänderungen.
- **BayWü:** `crosswalks/bayrs.json` verwendet belegte Bereiche des
  [systematischen Fortführungsnachweises BAYERN.RECHT](https://www.gesetze-bayern.de/Content/Pdf/ffn?all=False).
  Gemischte Zweige, insbesondere 21 und 224, bleiben ohne eigene geprüfte Übersetzung offen.
  Öffentliches Auftragswesen 73 folgt der entsprechenden gemeinsamen Finanz-Untergruppe.
  Ressortbuchstaben sind kein Klassifikationsmerkmal. Für Verwaltungsvorschriften gilt ein
  eigener Gliederungsplan ([Redaktionsrichtlinien Nr. 8.1](https://www.gesetze-bayern.de/Content/Document/BayVwV312180-34));
  dieser wird ausdrücklich nicht mit BayRS gleichgesetzt, obwohl die Herkunftsnummer im bestehenden
  Importfeld ebenfalls `bayrs` heißt. Seine Übersetzungsregel bleibt `pending`, damit betroffene
  Verwaltungsvorschriften nicht versehentlich über die Gesetze-Systematik eingeordnet werden.
- **West:** `crosswalks/nrw.json` enthält bislang keine akzeptierte Regel. Die
  [amtlichen Veröffentlichungsrichtlinien Nr. 2.1](https://recht.nrw.de/lrmb/verwaltungsvorschrift/01072025-richtlinien-fuer-die-gestaltung-den-erlass-und-die/)
  unterscheiden SGV.- und SMBl.-Gliederungsnummern von Dokumentidentitäten. Die vorhandenen
  9.361 Import-Manifeste (1.482 mit Zielidentität) enthalten kein entsprechendes Klassifikationsfeld
  und keine zugehörigen `ugl_nr`-/`gld_nr`-Parameter in den Rohdokumentadressen. Auch die 13.242
  Cache-Metadaten und die kanonischen Herkunftsverweise liefern solche Parameter nicht.
  Die verlinkten alten amtlichen Systematikadressen leiten auf die neue Suche um. Im Normtext
  zitierte Gliederungsnummern gehören häufig zu fremden Vorschriften und werden nicht verwendet.
  Vor einer West-Zuordnung braucht es einen eindeutig mit der Normidentität verbundenen Beleg;
  kein erneuter historischer Bulkimport und keine Titelklassifikation.

Jede Regel benennt ID, Land, Quellsystem, originalen Nummernbereich oder exakten Quelltitel,
Typbereich, Zielgruppen, Quellenbeleg, Entscheidung und Status. Nur `accepted` wirkt zur Laufzeit.
Die Daten sind eine bewusst partielle Übersetzung; neue Sim-Normen ohne eindeutigen Beleg bleiben
unzugeordnet. Aktuelle Abdeckungszahlen liefert `npm run subjects:check`, für Ost die dynamische
Store-Abfrage. Es werden keine festen Bestandszahlen in öffentliche Komponenten eingebaut.

## Projektion und Konflikte

`packages/legal-core/src/config/subjects.ts` enthält Datenvalidierung, deterministische Zuordnung
und `projectSubjectAssignments`. Der reproduzierbare Plan liest ausschließlich Metadaten. Er
schreibt weder `meta.json` noch Fassungen. Unbekannte Norm-IDs in ergänzenden Zuordnungen,
doppelte Regel-IDs und überlappende akzeptierte Regeln desselben Systems/Typbereichs sind Fehler.
Mehrfachzuordnung ist über explizite Zielgruppen und mehrere belegte Herkunftskennungen zulässig;
sie wird nicht als Mehrdeutigkeit gezählt. Konflikte verhindern die Freigabe statt stiller Priorisierung.

`assignments/index.json` ist der Einstieg für belegte normbezogene redaktionelle Entscheidungen.
Akzeptierte Einzelentscheidungen ersetzen die automatische Ableitung ausdrücklich. Ost-Einzelentscheidungen
sind verboten. Eine Liste gültiger Norm-IDs wird beim Gate gegen den committed Bestand geprüft.
`npm run check` führt dieses Gate mit aus.

Die Laufzeit verwendet eine **virtuelle Leseprojektion**: `packages/runtime/src/subjects.ts` übersetzt
exakt dieselben Regeln in SQL-Prädikate über vorhandene `subjects_json`- und `meta_json`-Felder.
Die eigenen D1-Länder benötigen deshalb keine neue Tabelle und keinen Reprojektionslauf. Ost nutzt
nur SELECT über seine vorhandenen Angaben und bleibt hinter dem Schema-Contract/Read-only-Binding.
Identische Eingaben ergeben identische Ergebnisse; eigene Norm-/Suchprojektionen bleiben unverändert.

`NormStore.countSubjectGroups` liefert Gesamtzahl, zugeordnet/unzugeordnet, Mehrdeutigkeiten und
Gruppenzahlen dynamisch. Normen werden pro Gruppe einmal, für die Gesamtabdeckung als Vereinigungsmenge
gezählt. Nicht zugeordnete Vorschriften bleiben ohne Sachgebietsfilter vollständig erreichbar.
Der Indexumfang von Ost und der redaktionelle Rechtsstand werden dadurch nicht verändert.

## Oberfläche und Filter

- `/sachgebiete/` zeigt nur belegte Hauptgruppen, Beschreibung und dynamische Vorschriftenzahl.
- `/sachgebiete/<id>/` verwendet `NormListing`, Store-Facetten, Rechtsstand, Typen, A–Z und Pagination.
- `land=west|nsh|ost|baywue` ist mit allen Listenfiltern kombinierbar. Nicht belegte Länder werden in
  Gruppen nicht als Auswahl angeboten; direkte leere Land-/Gruppenadressen zeigen einen verständlichen Leerzustand mit
  Rücksetzen des Landesfilters und Zugang zur vollständigen Landessuche. Unbekannte Gruppen liefern 404.
- Die Länderseiten und Hauptnavigation verlinken die Übersicht. Der öffentliche Hinweis auf die
  schrittweise Ergänzung bleibt sichtbar; normale Seiten zeigen keine internen Abdeckungsdiagnosen.
- Die Rechtssuche verwendet `subject=<stabile Gruppen-ID>` (mehrere Werte als OR). Bestehende freie
  Sachgebietstitel in API-Aufrufen bleiben unterstützt. `bereich`, Typ, Land, Rechtsstand, Geltungstag
  und Fassungswahl behalten ihre bisherige Bedeutung. Formular, Filterlinks und Pagination erhalten
  ausgewählte Sachgebiete. Der vorhandene mobile Filterdialog wird wiederverwendet.

Die Tests prüfen alle 56 Ost-Zuordnungen, dynamische Fixture-Zähler, Regelgrenzen und gemischte Zweige,
Ministerialblatt-Abgrenzung, Konflikte, unbekannte IDs, Mehrfachzuordnung, SQL-/Dateistore-Parität,
Geltungstag, Standardsuchumfang, Facetten, Pagination und wiederholte Projektion.
