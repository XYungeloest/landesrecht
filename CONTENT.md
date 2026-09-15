# CONTENT.md – Inhaltsformate und Pflegewege

## Normen

```text
content/norms/<jurisdiction>/<slug>/
  meta.json          Identität, Bezeichnungen, Typ, Status, Daten, Organe, Sachgebiete,
                     Beziehungen, externe Kennungen, Quellen
  history.json       initialVersionId + Historieneinträge (initial|amendment|repeal|correction|notice)
  versions/
    <versionId>.json unveränderlicher Fassungs-Snapshot (Kennung = Dateiname, i. d. R. Geltungsbeginn)
```

Regeln:

- `meta.id` ist `<jurisdiction>:<slug>`, `meta.jurisdiction` entspricht dem Verzeichnis.
- Jede Fassung: `simulationValidFrom`, `simulationValidTo` (null = offen); optional
  `sourceValidFrom/To`. Intervalle sind lückenlos und überschneidungsfrei (Folgefassung beginnt
  am Tag nach dem Ende der Vorfassung).
- Die erste Fassung einer übernommenen Norm beginnt am Ausgangsrechtsstand (2023-12-01); eigene
  Vorschriften der Simulation dürfen später beginnen.
- Eine neue Rechtslage erhält eine neue Fassungsdatei; bestehende Dateien werden nicht
  umgeschrieben (`npm run content:immutability`).
- Beziehungen: `relations: [{ type, target: { jurisdiction?, slug }, note?, date? }]` mit den Typen
  `amends, amended-by, repeals, repealed-by, replaces, replaced-by, implements, based-on, part-of,
  contains, refers-to, related`. Ohne `jurisdiction` liegt das Ziel in derselben Jurisdiktion.
- Externe Kennungen: `externalIdentifiers: [{ system, value, url? }]`, z. B.
  `{ "system": "revosax", "value": "4192" }`.
- Quellen: `sourceReferences` mit `kind` (`official-portal-snapshot | official-gazette |
  structured-transcription | amendment-source | provider-record | primary-pdf`), `system`,
  `availability` (`versioned` → `localSource`; `r2-archived` → `objectKey` + `sha256` + `url` +
  `retrievedAt`; `external` → `url`), optional `externalId`, `sourceValidFrom/To`, `sourceRole`, `note`.

Normkörper (`body`): Blöcke der Typen `book, part, chapter, section, subsection, paragraph,
article, annex, preamble, heading, subparagraph, paragraphText, item, subitem, quotedProvision,
table, tableRow, tableHeaderCell, tableCell, footnote, signature` (siehe `docs/DATA_MODEL.md`).

## Verkündungen

```text
content/publications/<jurisdiction>/<slug>.json
```

`{ slug, jurisdiction, title, gazette, year, issue, date, sourceReferences, entries[] }`; jeder
Eintrag verknüpft `normSlug` und optional `versionId` mit einer gespeicherten Fassung.

## Jurisdiktionen

Das Register ist Code (`packages/legal-core/src/config/jurisdictions.ts`);
`content/jurisdictions/` nimmt später redaktionelle Ländertexte auf.

## Prüfungen

```sh
npm run content:validate      # Parser, Intervalle, Baseline, Verkündungsbezüge
npm run content:immutability  # gespeicherte Fassungen unverändert gegenüber HEAD
npm run content:check         # beides
npm run d1:seed:local         # lokale Projektion zum Nachsehen
```

## Importierte Normen (RECHT.NRW → West)

`content/norms/west/` enthält neben der synthetischen Fixture-Norm zwölf über den RECHT.NRW-Importer
übernommene Stichtagsfassungen (`docs/RECHT_NRW_IMPORT.md`). Sie werden nicht von Hand bearbeitet:
Quelle der Wahrheit für ihre Ausgangsfassung ist der Importlauf (`npm run import:recht-nrw:sample -- --write`)
mit Manifest `data/imports/recht-nrw/manifest.json`, Transformationsreport `data/audits/recht-nrw/<slug>.json`
und archivierten Rohquellen `sources/recht-nrw/term-<id>/`. Spätere Änderungen der Simulation entstehen als
neue Fassungsdateien, nie durch Umschreiben von `versions/2023-12-01.json`.

## Testbestand

Der synthetische Bestand: `schulgesetz-west` (zwei Fassungen,
Quellintervall 2023-08-01 bis 2024-01-31), `kuestenschutzgesetz-nsh`, `testverordnung-ost`
(OstRecht-Format mit zitierter Vorschrift), `gemeindeordnung-baywue` (Artikelgliederung) und die
Verkündung `gv-west-2026-12`. Echte Gesetzestexte werden erst über die Importpipeline übernommen.
