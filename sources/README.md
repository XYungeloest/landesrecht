# Rohquellen

Dieses Verzeichnis ist der lokale Arbeitsbereich für unveränderte amtliche Rohquellen
(RECHT.NRW-, juris-SH-, BAYERN.RECHT- und REVOSax-Seiten, PDFs, Anlagen). Es wird nicht eingecheckt
(`.gitignore`) – mit einer Ausnahme: `sources/recht-nrw/term-<id>/` enthält die **Beispielkorpus-Fixtures**
der RECHT.NRW-Validierungskorpora LRGV (12) und LRMB (15): tatsächlich abgerufene Fassungsseiten,
Legacy-Textdateien, Ministerialblatt-Einträge und Anlagen mit dem SHA-256 der empfangenen Bytes im
Manifest (`data/imports/recht-nrw/manifest/<bereich>/term-<id>.json`). Sie dienen Regressionstests und
Offline-Neuerzeugung der Beispielnormen, nicht als Archiv des Bestands.

Regeln:

- Rohquellen werden nie verändert und nie direkt öffentlich gerendert.
- **Im Bulkimport liegen Rohquellen ausschließlich in R2** (`landesrecht-quellen`, Objektschlüssel
  `west/recht-nrw/2023-12-01/term-<id>/<sha256-präfix>-<rolle>.<ext>`), vor dem Upload im Staging unter
  `.cache/recht-nrw-r2-staging/` (nicht in Git). Quellenreferenzen tragen dann
  `availability: "r2-archived"`, `bucket`, `objectKey`, `sha256`, `url`, `retrievedAt` – nie einen Pfad unter
  `sources/`.
- Schutz: Der Bulkmodus bricht ab, wenn Rohquellen in ein versioniertes Verzeichnis geschrieben würden
  (`assertArchiveAllowed`); `npm run import:recht-nrw:audit` meldet Normen außerhalb der Beispielkorpora mit
  Quellen unter `sources/recht-nrw/`.
- Abrufe nur über die Importpipeline (`docs/IMPORT_ARCHITECTURE.md`, `docs/RECHT_NRW_BULK_IMPORT.md`) mit
  Mindestabstand und Budget; keine Umgehung von Zugriffsbeschränkungen.

## BAYERN.RECHT: Beispielkorpus derzeit nicht versioniert (Stand 2026-09-17)

`sources/bayernrecht/<id>/` enthält die 28 Exportpakete des BayWü-Beispielkorpus mit Begleitdatei
(`<id>.source.json`: Adresse, SHA-256, Content-Type, Bytes, Abrufzeit). Anders als die
RECHT.NRW-Fixtures liegen sie **nicht in Git**; `.gitignore` bleibt unverändert.

Grund ist die Größe: 56 MB, davon 49 MB in drei Paketen – `VVBayHO` (19 MB), `BAY_791_3_150_U`
(18 MB, Gebietskarte als Bilddatei), `BayKVzKG` (12 MB, 21 Anlagen-PDFs). Die übrigen 25 Pakete
zusammen sind rund 7 MB und damit kleiner als der versionierte RECHT.NRW-Korpus (21 MB).

Die Tests hängen nicht daran: `tests/unit/bayernrecht-corpus.test.ts` prüft Pfadkonventionen, die
Parsertests laufen gegen gekürzte Ausschnitte unter `tests/fixtures/bayernrecht/` (104 KB). Der Korpus
selbst ist aus dem Cache und über `corpus.json` jederzeit reproduzierbar; jede Datei trägt ihren
SHA-256.

Wer den Korpus versionieren will, hat zwei Wege – beides eine Entscheidung des Projekts, nicht des
Importers:

1. **Nur die 25 kleinen Pakete** aufnehmen (rund 7 MB, in der Größenordnung des West-Korpus) und die
   drei großen weiter ausschließen. Dann deckt Git die Strukturfälle ab, aber nicht die Bild- und
   PDF-Beilagen.
2. **Alle 28** aufnehmen (56 MB). Vollständig offline reproduzierbar, dafür wächst das Repository
   dauerhaft um die Bild- und PDF-Beilagen, die sich nie wieder ändern.

Bis dahin gilt derselbe Grundsatz wie für den Bulk: Rohquellen gehören in R2, nicht in Git – und für
BayWü ist noch kein R2-Präfix belegt, weil BayWü in diesem Stand lokal bleibt.
