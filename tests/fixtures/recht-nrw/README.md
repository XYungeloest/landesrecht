# RECHT.NRW-Fixtures

Minimale, echte Ausschnitte aus dem Portal (Boilerplate wie Druck-/Kopierleisten entfernt), je Strukturklasse ein Verzeichnis.
Die Dateien im Wurzelverzeichnis sind die Fixtures des Importpfads (Fassungsseiten, Legacy-Datei, Anlage).

| Verzeichnis | Struktur | Quelle (term) |
| --- | --- | --- |
| `range-headings/` | Einheitenspannen als Überschrift: nativ `Artikel I bis III` im Nummernfeld, Legacy `15 bis 16` (§§) in `lrdetail` | 26676, 26714 |
| `native-drupal/` | Gliederungskennzeichen im Nummernfeld (`1. Abschnitt`); redaktioneller „Hinweis“ als nummernlose Sektion nach der letzten Einheit | 29177, 26534 |
| `broken-html/` | Doppelt kodierte Entity im Nummernfeld (`§&amp;nbsp;1`), `<p>` in `<ul>`, Sektion ohne Nummernfeld mit Normtext | 32405, 27179, 26552 |
| `footnotes/` | Fußnoten in Sektionen ohne Einheit (Vorspann, Fußnotensektion) | 29679 |
| `duplicate-numbering/` | Artikel als zentrierte Überschriften mit je Artikel neu beginnender §-Zählung; Legacy-Inhaltsübersicht mit `lrdetail`-Einträgen | 29214, 26909 |
| `legacy-word/` | `lrdetail`-Varianten: Gliederung (`Teil 1`), fehlendes §-Zeichen (`33e`, `84`), Titelfortsetzung, Absatztext, reine Überschrift | 27945, 28223, 30034, 32258, 30682, 29852 |
| `annexes/` | Word-Anlage mit Absatzklasse `MsoPapDefault` (Tarifstellen) | 33844 |
| `lrmb/` | Ministerialblatt-Seiten (LRMB-Pfad) | – |

Regressionstests: `tests/unit/recht-nrw-parsers.test.ts` (Abschnitt „Parser-Residuen“), Report der Bulk-Fehlerfälle: `data/audits/recht-nrw/lrgv/PARSER_RESIDUALS.md`.
