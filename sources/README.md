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
