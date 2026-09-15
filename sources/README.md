# Rohquellen

Dieses Verzeichnis ist der lokale Arbeitsbereich für unveränderte amtliche Rohquellen
(RECHT.NRW-, juris-SH-, BAYERN.RECHT- und REVOSax-Seiten, PDFs, Anlagen), bevor sie im
R2-Quellenarchiv (`landesrecht-quellen`) abgelegt werden. Es wird nicht eingecheckt
(`.gitignore`) – mit einer Ausnahme: `sources/recht-nrw/term-<id>/` enthält die tatsächlich
abgerufenen Rohquellen des RECHT.NRW-Validierungskorpus (Fassungsseite, Legacy-Textdatei, Anlagen)
mit dem SHA-256 der empfangenen Bytes im Manifest `data/imports/recht-nrw/manifest.json`.

Regeln:

- Rohquellen werden nie verändert und nie direkt öffentlich gerendert.
- Jede archivierte Quelle wird mit SHA-256, Abrufzeitpunkt und amtlicher URL in der
  `sourceReferences`-Liste der Norm dokumentiert (`availability: "r2-archived"`, `objectKey`).
- R2-Objektschlüssel: `<jurisdiction>/<system>/<stichtag>/<datei>` (`packages/runtime/src/bindings.ts`).
- Bulkimporte laufen nur über die Pipeline in `docs/IMPORT_ARCHITECTURE.md`; kein Scraping
  ganzer Portale ohne ausdrücklichen Auftrag.
