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
- Fundstellen: `initialCitation` (meta) und `citation` (Fassung) sind Fundstellen der Simulation;
  übernommene Normen führen zusätzlich die reale Fundstelle `sourceCitation` (meta und Fassung, nie
  transformiert). `originEnactingBody` ist das Erlassorgan der Quelle aus einer ausdrücklichen Formel,
  `enactingBody` das Organ der Simulation (nur bei sicherer Entsprechung).
- Quellenlage einer übernommenen Fassung: `sourceStatus: { validity: exact | verified-active-at-baseline |
  reconstructed, text: direct | reconstructed, note? }`.
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

`content/norms/west/` enthält neben der synthetischen Fixture-Norm zwölf Stichtagsfassungen aus dem Bereich
LRGV (Gesetze, Rechtsverordnungen) und acht aus dem Bereich LRMB (Verwaltungsvorschriften, davon eine
rekonstruiert: `vv-lhundg-west`). Welche Vorschriften aufgenommen werden, regelt `docs/LEGAL_SCOPE.md`.
Importierte Normen werden nicht von Hand bearbeitet. Quelle der Wahrheit für ihre Ausgangsfassung ist der
Importlauf (`npm run import:recht-nrw:lrgv:sample -- --write`, `npm run import:recht-nrw:lrmb:sample -- --write`)
mit gemeinsamem Manifest `data/imports/recht-nrw/manifest.json`, Review-Queue
`data/imports/recht-nrw/review-queue.json`, Reports `data/audits/recht-nrw/`, Rekonstruktionsrezepten
`data/imports/recht-nrw/reconstructions/` und archivierten Rohquellen `sources/recht-nrw/term-<id>/`.
Spätere Änderungen der Simulation entstehen als neue Fassungsdateien, nie durch Umschreiben von
`versions/2023-12-01.json`. Eine Neuerzeugung der Ausgangsfassungen durch den Importer (z. B. nach einer
Schemaerweiterung) wird mit `node scripts/check-version-immutability.ts --allow west/<slug>/2023-12-01`
ausdrücklich freigegeben; der Normkörper muss dabei unverändert bleiben (Importaudit).

## Testbestand

Der synthetische Bestand: `testfixture-schulgesetz-west` („Testfixture Schulgesetz …“, zwei Fassungen,
Quellintervall 2023-08-01 bis 2024-01-31), `kuestenschutzgesetz-nsh`, `testverordnung-ost`
(OstRecht-Format mit zitierter Vorschrift), `gemeindeordnung-baywue` (Artikelgliederung) und die
Verkündung `gv-west-2026-12`. Echte Gesetzestexte werden erst über die Importpipeline übernommen.
