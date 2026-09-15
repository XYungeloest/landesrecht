# RECHT.NRW – Verwaltungsvorschriften (LRMB) → Land Westdeutschland

```text
LRMB importer:
Phase 1 / validated sample corpus (15 documents)
not yet full baseline import
```

Eigener Quellbereich des RECHT.NRW-Importers (`packages/importers/recht-nrw/src/lrmb/`) mit gemeinsamem
Manifest, gemeinsamer Review-Queue und derselben gehärteten Transformation wie LRGV
(`docs/RECHT_NRW_IMPORT.md`). Was aufgenommen wird, regelt `docs/LEGAL_SCOPE.md`.

## 1. Befund: LRMB auf RECHT.NRW (Recherche September 2026)

| # | Frage | Befund |
| --- | --- | --- |
| 1 | URL-Struktur | Datierte Fassungsseiten `/lrmb/verwaltungsvorschrift/<TTMMJJJJ>-<slug>`; undatierte Altdatensätze `/lrmb/verwaltungsvorschrift/<slug>` (übernommene SMBl-Sammlung, Texterkennung); `/lrmb/bekanntmachung/…`; vereinzelt `/lrmb/rechtsverordnung/…`. Ministerialblatt: Ausgabe `/mblnrw/<Jahr>-<Nr>`, Eintrag `/mblnrw/<Jahr>-s<Seite>`; mehrere Einträge einer Seite erhalten `-0`, `-1` …, Buchstabenseiten `s410a`. Seit Juli 2025 erscheint das Blatt als „MB.NRW <Jahr> Nr. <n>“. |
| 2 | Dokument- und Fassungsidentität | Stammnorm = Taxonomie-Term („Link zur aktuellsten Fassung“), wie bei LRGV (`term:<id>`). Datierte Seiten bilden eine Fassungsliste; undatierte Datensätze haben weder Fassungsliste noch „Gültig ab“. |
| 3 | Titel | `<h1>`. Bei Altdatensätzen enthält der Titel die Erlassangabe („… RdErl. d. Finanzministers v. 21 7 1972 -IDS-Tgb.Nr 3061/72¹)“); sie wird getrennt gelesen (`parseDecreeFromTitle`). |
| 4 | Kurztitel | Klammerzusatz (`VVzLRKG`, `VV LHundG NRW`), gleiche Zerlegung wie LRGV. |
| 5 | Aktenzeichen, RdErl-Nummer | Nur im Erlasskopf des Textes, z. B. „Runderlass / des Ministeriums der Finanzen / B 2905 - A 13 - IV A 2“ oder „- Az. 14-21.36.06.04-000003.2023-0013470 -“. Wird wörtlich als Quellhinweis übernommen, nie transformiert. |
| 6 | Ausgabedatum | „Vom 13. Dezember 2021“ oder „v. 30.7.2014“ im Kopf; Infobox „Ausfertigungsdatum“. |
| 7 | Gültig ab / bis | Infobox der Fassungsseite. Die Seite zeigt aber den konsolidierten Text: „Gültig ab“ ist oft der Beginn der Stammfassung, nicht des gezeigten Textstands (Dienstreise-Runderlass MAGS: „Gültig ab 23.08.2014“, Text mit Änderung vom 6. November 2023). „Gültig bis“ fehlt auch dann, wenn der Text längst außer Kraft ist (Vergaberichtlinien für Hochschulen: „am 30. Juni 2022 außer Kraft“). |
| 8 | Herausgebende Stelle | Nur im Erlasskopf („Runderlass des Ministeriums des Innern“, „RdErl. d. Landesregierung“); weder Infobox- noch Suchindexfeld. |
| 9 | MBl-Fundstelle | Fundstellenverlauf als letzter fetter Absatz des Textes („MBl. NRW. 2018 S. 242, geändert durch Runderlass vom 26. Juli 2021 (MBl. NRW. 2021 S. 535), …“); ab 2025 zusätzlich „Vollzitat“ in der Infobox. |
| 10 | Änderungshinweise | Fundstellenverlauf im Text; Änderungshistorie-Block mit „Redaktioneller Hinweis: Fassungen von Satzungen und Verwaltungsvorschriften stehen vollständig erst ab Oktober 2025 zur Verfügung.“ und Veröffentlichungsvermerken („Veröffentlichung: MB.NRW 2026 Nr. 94 Geändert durch Runderlass vom 10. April 2026, in Kraft getreten am 22. April 2026.“). |
| 11 | Aufhebungsinformationen | „Gültig bis“ (unvollständig), Außerkrafttretensklauseln im Text, im Suchindex `field_outforce_date` und `field_historically` (nur zur Querprüfung im Bulkimport). |
| 12 | HTML / PDF | Natives Drupal-HTML (eine `legaldoc-article`-Sektion ohne §-Einheiten), selten Legacy-Datei im iframe (ältere Fassungen); PDF der Veröffentlichung. |
| 13 | Anlagen | Anlagen-Block (`attachment-item`), überwiegend PDF. Bei der VV zur LHO steht der gesamte Regelungsgehalt in 27 PDF-Anlagen. HTML-Anlagen vor allem bei Altdatensätzen. |
| 14 | Tabellen | `<table>` im Text (Wohnraumförderungsbestimmungen: Wohnflächenobergrenzen). |
| 15 | Gliederung | Dezimal bis fünf Stufen (1, 1.1, 1.1.1 …); römische Teile mit eigener Nummerierung (VV LHundG: „I. Allgemeiner Teil“, „II. Besonderer Teil“); Buchstaben- und Spiegelstrichlisten; Inhaltsübersichten. Nummern in vier Schreibweisen: fett mit Überschrift, fett mit Text, Nummer/Überschrift/Text als Zeilen eines Absatzes, ältere Form „1.“; teils mehrere Nummern in einem Absatz. |
| 16 | SMBl-Nummern | Gliederungsnummer als fette Zahl im Ministerialblatt-Eintrag (453, 631, 2060, 203205); bei Altdatensätzen im Dateinamen der Anlagen (`smbl_631_…`); nicht auf der Fassungsseite. |
| 17 | Enumeration | Sitemaps: 6 312 LRMB-Adressen – 4 747 Verwaltungsvorschriften (785 datiert, 3 962 undatiert), 1 563 Bekanntmachungen, 2 Rechtsverordnungen. Suchindex (`state_law_ministerial_gazette`): 6 351 Dokumente (4 770 VwV, 1 579 Bekanntmachungen, 2 RVO); bei VwV ist `field_effective_from` nur 809-mal gesetzt, davon 509 ≤ 2023-12-01. |
| 18 | Stand 1. Dezember 2023 | Nicht direkt abrufbar. Wird aus Fassungsseite, Fundstellenverlauf und Ministerialblatt belegt (Abschnitt 4) oder mit geprüftem Rezept rekonstruiert (Abschnitt 5). |
| 19 | Historische Unvollständigkeit | Redaktioneller Hinweis „vollständig erst ab Oktober 2025“. Fassungsseiten vor Oktober 2025 können spätere Änderungen enthalten (VV TB NRW: Fassung 2022–2025, Fundstellenverlauf bis 2025) oder frühere Textstände zeigen. |
| 20 | Rekonstruktionsquellen | Aktuelle Seite, historische Fassungsseiten, Ministerialblatt-Einträge (HTML mit wörtlichen Änderungsbefehlen), PDFs, Original-Runderlass, Änderungs- und Aufhebungsrunderlasse. Eine spätere Konsolidierung dient nur als Hilfsmittel, nie als Beleg ohne Befehlsprüfung. |

## 2. Entscheidung: eigener Quellbereich im gemeinsamen Importer

```text
packages/importers/recht-nrw/src/
  common/     Fetcher, HTML, Quellidentität, Fassungsseite, Stichtagsauswahl, Parserbausteine,
              Integrität, Manifest (v2), Review-Queue, Coverage, Schreibpfad
  lrgv/       Gesetze und Rechtsverordnungen (Normalisierung, Importpfad)
  lrmb/       Verwaltungsvorschriften: Klassifikation, Erlasskopf/Fundstellenverlauf/Klauseln,
              Parser, Ministerialblatt, Stichtagsprüfung, Rekonstruktion, Importpfad
  transform/  gemeinsame Überleitung: Regeln, Erkennung, Erlassorgane, Transformation
  cli.ts      ein CLI für beide Bereiche
```

Gründe: LRMB unterscheidet sich in Gliederung (dezimal statt §), Zeitmodell (konsolidierte Seiten,
unvollständige Fassungen) und Normativität (Bekanntmachungen, Einzelfälle). Fetcher, Quellidentität,
Manifest, Review-Queue, Transformation und Schreibpfad sind gemeinsam, damit beide Bereiche dieselben
Sicherungen haben. Keine neue Architektur: dieselbe Pipeline, dieselben kanonischen Dateien.

## 3. Dokumenttypen und Normativitätsfilter

| Quelltyp (`sourceDocumentType`) | Erkennung | Kanonischer Typ |
| --- | --- | --- |
| `allgemeine-verwaltungsvorschrift` | Titel „Allgemeine Verwaltungsvorschrift(en) …“ | `allgemeine-verwaltungsvorschrift` |
| `durchfuehrungserlass` | Titel enthält „Durchführungserlass“ | `durchfuehrungserlass` |
| `richtlinie` | Titel mit „…richtlinie(n)“ oder „Förderbestimmungen“ | `richtlinie`, bei Zuwendungen/Förderung `foerderrichtlinie` |
| `verwaltungsvorschrift` | Titel „Verwaltungsvorschrift(en) …“ oder „VV“ | `verwaltungsvorschrift` |
| `runderlass` | Erlasskopf oder Titel „Runderlass“, „RdErl.“ | `runderlass` |
| `sonstige-verwaltungsvorschrift` | sonst | `verwaltungsvorschrift` |

Normativität (`lrmb/classify.ts`): Ausschlussgründe zuerst (Stellenausschreibung, Personalnachricht,
Sitzung/Tagesordnung, Verleihung/Anerkennung, Plangenehmigung, Wahl, Satzung einer Körperschaft,
Berichtigung, Verfahrensbekanntmachung) → `exclude`. Dann Prüffälle (Hinweise, Empfehlungen, Merkblatt,
Leitfaden, Kopferlass, Muster, Preisregelung, jede Bekanntmachung, anderer Portaltyp) → `review`.
`include` nur mit Erlasskopf oder Vorschriftentitel und abstrakt-generellen Regelungsformeln. Kein
Zweifelsfall wird automatisch übernommen.

## 4. Zeitmodell und Belege

Aufgenommen wird nur mit Nachweis `validFrom <= 2023-12-01` und (`validTo` offen oder
`>= 2023-12-01`). Statuswerte (Manifest `baselineStatus`, Fassung `sourceStatus`):

| Wert | Bedeutung |
| --- | --- |
| `active-at-baseline` / `not-active-at-baseline` / `undetermined` | Ergebnis der Stichtagsprüfung; `undetermined` führt zu Review |
| `sourceStatus.validity = exact` | Portalintervall ausdrücklich belegt, Text unverändert seit Intervallbeginn |
| `verified-active-at-baseline` | Geltung und Textstand belegt, Intervallbeginn = Inkrafttreten der letzten eingearbeiteten Änderung |
| `reconstructed` | Intervall aus Änderungsbelegen hergeleitet (Rekonstruktion) |
| `sourceStatus.text = direct` / `reconstructed` | Text unverändert übernommen / Stichtagsfassung rekonstruiert |

Regeln (`lrmb/validity.ts`):

1. **Widerlegung:** Eine Außerkrafttretensklausel vor dem Stichtag widerlegt die Portalangabe
   (`validity-expired-before-baseline`, Review `metadata-conflict`). Liegt sie vor „Gültig bis“, ist das
   ein Konflikt; liegt sie danach, eine vorzeitige Ablösung (Warnung).
2. **Geltung:** Datierte Stammnormen über die lokale Stichtagsauswahl. Undatierte Altdatensätze nur,
   wenn sie vor dem Stichtag in Kraft waren (Klausel oder Änderung) **und** nach dem Stichtag noch
   geändert wurden – eine aufgehobene Vorschrift wird nicht geändert. Sonst `undetermined`.
3. **Textstand:** Der Fundstellenverlauf der gewählten Seite nennt die eingearbeiteten Änderungen. Jede
   Änderung braucht ein belegtes Inkrafttreten: Ministerialblatt-Eintrag, der die Vorschrift mit
   Ausfertigungsdatum und Fundstelle nennt (Seitenkollisionen `-0/-1` werden so aufgelöst), plus
   Inkrafttretensklausel und Veröffentlichungsdatum; oder Veröffentlichungsvermerk mit „in Kraft getreten
   am“. Die Eingangsformeln („der zuletzt durch Runderlass vom … geändert worden ist“) müssen die Kette
   lückenlos bestätigen.
   - alle eingearbeiteten Änderungen vor dem Stichtag, keine fehlende → **direkt**;
   - eingearbeitete Änderung nach dem Stichtag oder fehlende Änderung vor dem Stichtag →
     **Rekonstruktion erforderlich**;
   - Inkrafttreten nicht belegbar (z. B. „n. v.“), Kette widersprüchlich, Fundstellenverlauf unlesbar →
     **Rekonstruktion unsicher** (Review).
4. Änderungen, die als eigene Portalfassung beginnen, betreffen den Text der gewählten Seite nicht.
5. Ein präzises `sourceValidTo` wird nur aus Portalangabe oder belegtem Inkrafttreten der nächsten
   Änderung übernommen, nie aus einer Klausel geschätzt.

## 5. Rekonstruktion

Nur mit geprüftem Rezept `data/imports/recht-nrw/reconstructions/term-<id>.json`
(`recht-nrw-lrmb-reconstruction/1`):

```json
{
  "sourceIdentity": "term:23528", "mode": "reverse", "baselineDate": "2023-12-01",
  "base": { "url": "…", "description": "Konsolidierter Portaltext …" },
  "amendments": [{ "decreeDate": "2024-07-16", "citation": "MBl. NRW. 2024 S. 805", "gazetteUrl": "…",
    "steps": [{ "id": "mbl-2024-805-3", "instruction": "In Nummer 11.4 Satz 1 wird die Angabe „gestrichen“ durch die Angabe „aufgehoben“ ersetzt.",
      "operation": "revert-replacement", "target": { "scope": "II.", "label": "11.4" }, "from": "gestrichen", "to": "aufgehoben" }] }],
  "review": { "reviewedAt": "2026-09-15", "note": "…" },
  "expected": { "baseFingerprint": "<sha256>", "resultFingerprint": "<sha256>" }
}
```

Operationen: `remove-inserted-text`, `revert-replacement` (rückwärts), `apply-replacement`,
`insert-text-after`, `remove-text` (vorwärts). Die Anwendung (`lrmb/reconstruction.ts`) prüft fail-closed:

1. Die Änderungen des Rezepts sind genau die, die die Stichtagsprüfung verlangt.
2. Jeder Befehl steht wörtlich im archivierten Ministerialblatt-Eintrag.
3. Die zitierten Wortlaute („…“, verschachtelt) stimmen mit den Schrittdaten überein.
4. Ziel (Gliederungsraum und Nummer) existiert genau einmal; der Wortlaut kommt darin genau einmal vor.
   Ein durch das Zurücknehmen leer gewordener Absatz entfällt und wird gezählt.
5. Basis- und Ergebnis-Fingerabdruck (SHA-256 über den Blockbaum) entsprechen dem Rezept; eine zweite
   Anwendung liefert dasselbe Ergebnis.

Manifest: `reconstructionSources` (Basis und Änderungen mit SHA-256, Archivpfad, Inkrafttreten),
`reconstructionSteps` (Schritt, Befehl, Fingerabdruck vorher/nachher). Die Fassung trägt
`sourceStatus { validity: reconstructed, text: reconstructed, note }`; die Website zeigt den Hinweis
„Stichtagsfassung rekonstruiert“ mit Verweis auf die Quellen.

Rezepte werden aus den wörtlichen Befehlen erzeugt und vor dem Einchecken je Schritt gegen den
Vorher-/Nachher-Text geprüft; es gibt keine automatische Deutung von Änderungsbefehlen.

## 6. Parser und Blockmodell

Gleiches Blockmodell wie LRGV, keine Erweiterung der Blocktypen: Teil → `part`, Nummer 1 → `section`,
Nummer 1.1 und tiefer → `subsection` (Tiefe aus der Nummer), Fließtext → `paragraphText`,
Aufzählungen → `item`/`subitem`, Tabellen → `table`, Anlagen im Text → `annex`, Fußnoten → `footnote`,
Überschriften → `heading`. Sprungziele entstehen aus den Nummern (`abschnitt-2`, `unterabschnitt-2-3-1`),
jede Nummer ist eine eigene Sucheinheit.

Erlasskopf (Titel, Erlassart, herausgebende Stelle, Aktenzeichen, Datum), Fundstellenverlauf und
Fußnotendefinitionen gehören nicht zum Normkörper; Kopf und Fundstellenverlauf stehen als
`sourceNotes`. Unbekannte Elemente, Bilder, doppelte Nummern im selben Gliederungsraum und
§-Einheiten sind Fehler; Nummernlücken sind Warnungen. Legacy-Dateien und HTML-Anlagen gehen in Review.

## 7. Transformation und Schutzregeln

Dieselbe gehärtete Transformation wie LRGV: Erkennung vor der Transformation, Entscheidung je
Kategorie, Prüfung danach. Erlassorgan nur aus dem Erlasskopf („Runderlass des Ministeriums …“) als
`originEnactingBody`; Ministerien und Behörden erhalten kein Simulationsorgan (Review
`institution-mapping`). Nie transformiert: `MBl. NRW.`, `SMBl. NRW.`, `GV. NRW.`, `SGV. NRW.`, `MB.NRW`,
historische Aktenzeichen und Erlassnummern (Quellhinweis „Erlasskopf der Quelle“), Ministerialblatt-
Nummern, Originaltitel in Quellenreferenzen, URLs, Hashes, Quellgeltung.

Nach dem Stichtag gilt Simulationsrecht: Es entsteht nur `versions/2023-12-01.json`; spätere reale
Änderungen stehen nur in Belegen und Manifest.

## 8. Textintegrität

Fetch → Parse: nummerierte Einheiten gegen unabhängige Zählung im Roh-HTML, Tabellen, Fußnotenverweise,
doppelte Nummern, Textumfang (Normkörper + Kopf + Fundstellenverlauf + Fußnoten gegen Roh-HTML, ±3 %,
mindestens 200 Zeichen). Rekonstruktion: Blockzahl (abzüglich dokumentiert entfallener Absätze),
Tabellen, Fingerabdrücke, Wiederholbarkeit. Source → Canonical wie LRGV. Anlagen: jede Anlage der Seite
ist als Quelle registriert.

## 9. Manifest, Review-Queue, Coverage

- Gemeinsames Manifest `data/imports/recht-nrw/manifest.json` (Schema 2): `sourceArea`,
  `sourceDocumentType`, `normativity`, `baselineStatus`, `validityEvidence`, `reconstructionStatus`,
  `reconstructionSources`, `reconstructionSteps`, `reviewStatus`, `transformerVersion` u. a. Auch
  ausgeschlossene, nicht geltende und Review-Fälle erhalten einen Eintrag samt Belegen
  (`data/audits/recht-nrw/lrmb/term-<id>.json`).
- Review-Queue `data/imports/recht-nrw/review-queue.json`: Fälle verschwinden bei Reimport nicht;
  Entscheidungen (`resolved`, `accepted`) bleiben erhalten.
- Coverage `data/audits/recht-nrw/coverage.json` (LRMB: enumeriert, normativ, am Stichtag, direkt,
  rekonstruiert, Review, ausgeschlossen).

## 10. Beispielkorpus (15 Dokumente)

Rationale je Eintrag: `data/imports/recht-nrw/lrmb-sample-corpus.json`.

| Dokument | Quelltyp | Fundstelle | Stichtag | Text | Besonderheit / Grund |
| --- | --- | --- | --- | --- | --- |
| Allgemeine Verwaltungsvorschriften zum Landesreisekostengesetz (`vvzlrkg-west`) | allgemeine VwV | MBl. NRW. 2021 S. 1096, geändert 2022 S. 410 a | geltend (2022-06-09 – 2025-12-31, belegt) | direkt | 115 Nummern, drei PDF-Anlagen, Änderung 2022 eingearbeitet, spätere Fassung ab 2026 |
| Runderlass für die Fassung von Rechtsbehelfsbelehrungen | Runderlass | MBl. NRW. 2023 S. 1314 | geltend (ab 2023-11-25) | direkt | 2023 erlassen, langes Aktenzeichen, knapp vor dem Stichtag |
| Durchführungserlass Regionales Wirtschaftsförderungsprogramm (`rwp-beratungserlass-west`) | Durchführungserlass | MBl. NRW. 2023 S. 535 | geltend (2023-07-01 – 2024-03-24) | direkt | Portalende vor Textende (vorzeitige Ablösung, Warnung) |
| Allgemeine Verwaltungsvorschrift zu § 74 Abs. 4 und § 79 Abs. 1 LBesG | allgemeine VwV | MBl. NRW. 2022 S. 658 | geltend (ab 2022-08-01) | direkt | VwV zu einem Gesetz, befristet bis 2027 |
| Runderlass Kostentragung in der Kampfmittelbeseitigung | Runderlass | MBl. NRW. 2022 S. 229 | geltend (ab 2022-06-01) | direkt | dreistufige Dezimalgliederung, Landesname in Überschriften |
| Genehmigung von Dienstreisen … MAGS | Runderlass | MBl. NRW. 2014 S. 452, geändert 2018 und 2023 | geltend (ab 2023-11-17, belegt) | direkt | alter Erlass, Schreibweise „1.“, Änderungsseite `2018-s302-1` mit Satzfehler im Datum |
| Rechtsbehelfsbelehrung bei Bußgeldbescheiden | Runderlass | MBl. NRW. 2018 S. 242, geändert 2021, 2022, 2023 | geltend (ab 2023-11-09, belegt) | direkt | drei Änderungen, Seitenkollision `2021-s535-0`, PDF-Anlage |
| Verwaltungsvorschriften zum Landeshundegesetz (`vv-lhundg-west`) | VwV | MBl. NRW. 2003 S. 580, geändert 2017, 2020, 2024 | geltend (2020-07-31 – 2024-07-30, hergeleitet) | **rekonstruiert** | undatierter Datensatz, Teile I/II; Änderung vom 16. Juli 2024 (in Kraft 31. Juli 2024) mit sechs Befehlen zurückgenommen |
| Vergaberichtlinien für Hochschulen | Richtlinie | MBl. NRW. 2022 S. 90 | nicht geltend | – | Portal ohne Ende, Text außer Kraft am 30. Juni 2022 (Review `metadata-conflict`) |
| Verwaltungsvorschrift Technische Baubestimmungen NRW | VwV | MBl. NRW. 2021 S. 444, geändert 2022–2025 | geltend | Rekonstruktion unsicher | Fassung 2022–2025 enthält spätere Änderungen, eine davon „n. v.“ (Review) |
| Verwaltungsvorschriften zur Landeshaushaltsordnung | VwV | MBl. NRW. 2022 S. 445 | – | – | Regelungsgehalt nur in 27 PDF-Anlagen (Review `normativity`) |
| Wohnraumförderungsbestimmungen (WFB) | Richtlinie | MBl. NRW. 2022 S. 242 | nicht geltend (bis 2023-02-14) | – | Tabelle, Inhaltsübersicht, 235 Nummern |
| Verwaltungsvorschriften zum Landesorganisationsgesetz | VwV | RdErl. v. 12.2.1963 | unbestimmt | – | SMBl-Altdatensatz, Texterkennung, keine Belege (Review `historical-gap`) |
| Hinweise zur Berücksichtigung des ÖPNV | sonstige | MBl. NRW. 1986 S. 1013 | – | – | Grenzfall „Hinweise“ (Review `normativity`) |
| 9. öffentliche Sitzung der Vertreterversammlung der Unfallkasse | Bekanntmachung | MBl. NRW. 2021 S. 324 | – | – | ausgeschlossen (Sitzungsbekanntmachung) |

## 11. Rohquellen

Die Rohquellen des Beispielkorpus (Fassungsseiten, Ministerialblatt-Einträge, PDF-Anlagen übernommener
Dokumente) liegen – wie beim LRGV-Korpus – ausnahmsweise versioniert unter `sources/recht-nrw/term-<id>/`
(SHA-256 im Manifest). Im Bulkimport gehören sie ausschließlich nach R2 (`docs/RECHT_NRW_BULK_IMPORT.md`).

## 12. Bedienung

```sh
npm run import:recht-nrw:lrmb:inspect -- --url <lrmb-url>     # Seite, Erlasskopf, Typ, Normativität, Fundstellenverlauf
npm run import:recht-nrw:lrmb -- --url <lrmb-url>             # Dry-run des LRMB-Importpfads
npm run import:recht-nrw:lrmb -- --url <lrmb-url> --write     # schreibt Rohquellen, Norm, Audit, Manifest, Review-Queue
npm run import:recht-nrw:lrmb:sample [-- --write]             # Beispielkorpus mit Erwartungsvergleich
npm run import:recht-nrw:review -- --area lrmb                # offene Review-Fälle
npm run import:recht-nrw:coverage -- --write                  # Coverage-Report
npm run import:recht-nrw:audit                                # gemeinsames Audit (LRGV + LRMB)
```

## 13. Grenzen und offene Punkte

- PDF-Anlagen werden als Quelle registriert, nicht als Text übernommen (Review `attachment`).
- Legacy-Fassungen (iframe) und HTML-Anlagen im LRMB-Bereich gehen in Review.
- Änderungsbefehle werden nicht automatisch gedeutet; Rezepte sind Einzelarbeit mit Prüfung.
- „n. v.“-Änderungen und Einträge ohne HTML-Text im Ministerialblatt verhindern den Textstandsbeleg.
- Undatierte SMBl-Altdatensätze sind ohne Änderungen nach dem Stichtag nicht belegbar (Review).
- Die Suche erkennt Strukturadressen „Nr. 2.3“ noch nicht (Volltext und Sprungziele funktionieren).
- Die Normativitätsregeln beruhen auf Titel und Erlasskopf; sie sind konservativ und erzeugen Prüffälle.
