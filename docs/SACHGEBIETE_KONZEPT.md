# Gemeinsame Sachgebietsnavigation

## Taxonomie und Verbindlichkeit

Als gemeinsame erste Ebene eignen sich die acht OstRecht-Hauptgruppen:

1. Staats- und Verfassungsrecht
2. Verwaltung
3. Rechtspflege, Zivilrecht und Strafrecht
4. Landesplanung, Baurecht, Wohnungen, Verkehr
5. Finanzwesen
6. Wirtschaftsrecht, Landwirtschaft, Umweltrecht
7. Kulturelle Angelegenheiten
8. Sozialwesen

Stabile sprachunabhängige IDs (z. B. `staat-verfassung`, `verwaltung`, `justiz`, `planung-verkehr`,
`finanzen`, `wirtschaft-umwelt`, `bildung-kultur`, `soziales`) von öffentlichen deutschen Titeln trennen.
Die acht Gruppen sind ein Entwurf, keine bereits länderübergreifend amtliche Systematik. Untergruppen erst
nach einer redaktionellen Synopse veröffentlichen. Insbesondere „Förderrichtlinien“ (Ost-Untergruppe 55)
ist eine Quellklassifikation und kein verlässlicher Hinweis auf das materielle Fördergebiet. Sie darf nicht
anhand des Titels automatisch in Wirtschaft, Bildung oder Soziales umgebucht werden.

## Bestandsprüfung und belastbare Abdeckung

Grundgesamtheit sind Stammnormen aller Typen und Rechtsstände, nicht Fassungsdateien und nicht nur die neue
Standardsuche. Zählung im committed Landesrecht-Bestand und lesend in der produktiven OstRecht-D1
`ostrecht-recht` (Sync vom 16. Oktober 2026). Der vorhandene vollständige lokale Seed wurde
zusätzlich als unabhängige Vergleichsgrundlage geprüft; er ist älter als die Remote-Projektion.

| Land | Normen | Gefüllte subjects | Klassifikationskennung | Bereits sicher in gemeinsamen Entwurf überführbar | Noch ohne geprüfte gemeinsame Zuordnung |
| --- | ---: | ---: | --- | ---: | ---: |
| West | 1.528 | 0 | 1.482 RECHT.NRW-Dokumentkennungen, keine Sachgebietskennung im kanonischen Bestand | 0 | 1.528 |
| NSH | 2.705 | 0 | 2.669 `gliederungsnummer-sh` | 0 | 2.705 |
| BayWü | 1.664 | 0 | 1.125 `bayrs` | 0 | 1.664 |
| Ost | 5.226 im Landesrecht-Geltungsbereich | 5.226 | vorhandene OstRecht-Sachgebiete | 5.226 | 0 |

„0 sicher“ bei NSH und BayWü bedeutet fehlende geprüfte Übersetzungstabelle, nicht fehlende
Klassifikationsinformation. 36 NSH-Normen und 539 BayWü-Normen haben auch die genannte Kennung nicht.
Diese Mengen dürfen später nicht stillschweigend anhand von Titeln geschlossen werden.

Die Remote-D1 enthält insgesamt 5.227 Normen. Eine ausschließlich vor dem Ausgangsrechtsstand
geltende Norm fällt aus dem Landesrecht-Scope heraus. Alle 5.226 verbleibenden Normen besitzen
mindestens einen in der OstRecht-Systematik bekannten Sachgebietstitel (SELECT mit `json_each`,
exakter Abgleich gegen die 56 definierten Titel, 0 Schreibzugriffe). Der ältere lokale Seed enthält
5.212 Normen, davon 5.211 im Portal-Scope, ebenfalls alle zuordenbar. Die eigentliche Portalnavigation
muss dieselben Bestands- und Geltungsfilter wie die Stores anwenden. Der Remote-Freshness-Audit
meldet für den Landesrecht-Stichtag drei geltende Fassungen ohne passende Volltexteinheiten
(Bezirksordnung, Gemeindeordnung, Landkreisordnung). Eine Sachgebietszuordnung ersetzt daher
keinen Nachweis vollständiger Volltextsuche; historische Volltextsuche bleibt ebenfalls eingeschränkt.

### Quellen und sichere Ableitungen

- **Ost:** `../staatsregierung/packages/shared/src/config/law-subjects.json` enthält acht Hauptgruppen,
  56 Untergruppen und zehn Förderbereiche. `law-subjects.ts` enthält die ausdrücklich geprüfte
  FSN-Zuordnung. `meta.subjects`, `primarySubject` und `sourceReferences[].fsnNumber` sind im vorgelagerten
  Bestand vorhanden, D1 führt `law_norms.subjects_json`. Eine exakte Zuordnung bekannter Sachgebietstitel
  zur dort definierten Hauptgruppe ist deterministisch und belastbar. Unbekannte Titel bleiben offen.
  Landesrecht liest diese Angaben über den bestehenden Read-only-Adapter; es pflegt keine Ost-Kopie.
- **West/NRW:** RECHT.NRW-Dokumentnummern und Fundstellen identifizieren Dokumente, keine Sachgebiete.
  LRGV/LRMB und der Normtyp sind ebenfalls keine Sachgebiete. Im kanonischen Bestand wird keine
  NRW-Systematik mitgeführt. Vor einer Automatik braucht es eine belegte amtliche Klassifikationsquelle
  und deren geprüfte Zuordnung zur Normidentität. Vorhandene Import-Manifeste und archivierte Quellen
  können dafür gezielt untersucht werden; kein neuer Bulkabruf und keine Titelklassifikation.
- **NSH/Schleswig-Holstein:** `externalIdentifiers` enthält `gliederungsnummer-sh`, z. B. `223-13`,
  `200-11-1`, `6623.58`. Der Importer `packages/importers/juris-sh` übernimmt diese Herkunftsangabe.
  Sie ist eine gute Grundlage, aber kein Ost-FSN. Erforderlich sind die passende SH-Systematik,
  getrennte Prüfung der Gesetzes- und Verwaltungsvorschriftenzählung und eine freigegebene
  Präfix-/Bereichstabelle. Keine Abschneidung auf die erste oder die ersten beiden Ziffern nach Ost-Regeln.
- **BayWü/Bayern:** `packages/importers/bayernrecht/src/parse/norm.ts` liest `gliederungsNr.BayRS`
  und belegte Ersatzangaben; gespeichert als generisches System `bayrs`, z. B. `3133-J`, `2190-F`,
  `7912.0-U`. Die Verwaltungsressort-Endung alleine beschreibt kein Sachgebiet. Eine belegte BayRS-
  Gliederung mit geprüften Bereichsregeln ist nötig; BayRS und Ost-FSN sind nicht gleichzusetzen.
- **Kanonisches Modell:** `NormMeta.subjects: string[]` und die Suchfilter existieren bereits. Die drei
  eingefrorenen Länder haben dort keine Einträge. Diese Felder werden für den Ausbau nicht nachträglich
  befüllt. Strukturelle Kapitelnummern innerhalb eines Gesetzes sind keine Sachgebietskennungen.

## Ergänzende redaktionelle Projektion

Vorschlag: `data/editorial/subjects/taxonomy.json`, `crosswalks/<source-system>.json` und
`assignments/<jurisdiction>.json` außerhalb von `content/` und `data/simulation/`.

Eine Zuordnung trägt `(jurisdiction, normId)`, `subjectIds`, Herkunftssystem, ursprüngliche Kennung,
Quellenbeleg, Regel-ID und Regelversion, Prüfentscheidung (`accepted|pending|rejected`) und optional ein
Anwendungsintervall. Ein normbezogener redaktioneller Override hat Vorrang vor einem akzeptierten
Crosswalk. Widersprechende Regeln stoppen die Projektion; keine automatische Mehrheitsentscheidung.
Unbekannte Kennungen und Normen ohne Beleg bleiben ausdrücklich unzugeordnet. Mehrfachzuordnungen
sind erlaubt und werden in Bestandszahlen als Vereinigungsmenge gezählt.

Normen und ihre immutable Fassungen bleiben byteidentisch. Sachgebietsprojektionen werden versioniert,
aber niemals als Rechtsänderung oder neue Fassung angezeigt. Bei Ost erfolgt die Zuordnung bekannter
Quelltitel im Adapter/Projektionslesemodell, nicht durch Schreibzugriffe auf OstRecht-D1.

## Filter, Navigation und Implementierungsplan

1. Taxonomie und Begriffsübersetzung redaktionell entscheiden. Die vollständigen amtlichen
   Quellsystematiken für SH, BayRS und gegebenenfalls NRW mit Provenienz dokumentieren.
2. Crosswalks anhand eindeutiger Nummernbereiche erarbeiten; je Regel Positiv-, Grenz- und Konfliktfälle
   prüfen. Zuerst Dry-run mit Anzahl zugeordneter, mehrdeutiger und offener Normen pro Land und Normtyp.
3. Kleines fail-closed Schema und Validator für die redaktionelle Projektion bauen; Norm-IDs gegen die
   Stores prüfen. Baseline-, Tabellen- und Simulationsgates bleiben unverändert. Erst nach Annahme der
   Regeln eine zusätzliche Zuordnung materialisieren; keine Normtexte oder Normmetadaten überschreiben.
4. Gemeinsame Store-Facetten und Suchfilter auf stabile `subject`-IDs umstellen beziehungsweise um die
   ergänzende Projektion erweitern. Für eigene D1-Länder gegebenenfalls separate Zuordnungstabelle mit
   Index `(subject_id, norm_id)`; Ost ausschließlich SELECT auf vorhandene Angaben. Kein titelbasierter
   Laufzeitfallback. Umfang `bereich`, Land, Geltungstag und Rechtsstand bleiben kombinierbar.
5. Erst mit belegter Abdeckung `/sachgebiete/` und `/sachgebiete/<id>/` veröffentlichen: gefüllte Gruppen,
   Länderzahlen und transparent angegebene Abdeckung. Unzugeordnete Normen bleiben über Suche und
   Länderübersichten erreichbar. Gleiche mobile Filterkomponente verwenden, leere Gruppen ausblenden.
6. Regression: beide Store-Dialekte, länderübergreifende Vereinigungsmengen, Mehrfachzuordnung,
   unbekannte Nummern, historische Geltung und unveränderte Freeze-Fingerabdrücke. Keine leere öffentliche
   Seite und keine massenhafte Klassifikation vor diesen Entscheidungen.
