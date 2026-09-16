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

`content/norms/west/` enthält zwölf Stichtagsfassungen aus dem Bereich LRGV (Gesetze, Rechtsverordnungen)
und acht aus dem Bereich LRMB (Verwaltungsvorschriften, davon eine rekonstruiert: `vv-lhundg-west`); der
Bulkimport ergänzt den vollständigen Ausgangsbestand (`docs/RECHT_NRW_BULK_READINESS.md`). Welche
Vorschriften aufgenommen werden, regelt `docs/LEGAL_SCOPE.md`. Importierte Normen werden nicht von Hand
bearbeitet; jede Norm unter `content/norms/west/` braucht einen übernommenen Manifesteintrag
(`npm run content:validate`). Quelle der Wahrheit für ihre Ausgangsfassung ist der Importlauf mit
Manifest `data/imports/recht-nrw/manifest/<bereich>/term-<id>.json`, Review-Fällen
`data/imports/recht-nrw/review/<bereich>/term-<id>.json`, Slug-Registry `data/imports/recht-nrw/slug-registry.json`,
Overrides `data/imports/recht-nrw/overrides.json`, Reports `data/audits/recht-nrw/`, Rekonstruktionsrezepten
`data/imports/recht-nrw/reconstructions/` und Rohquellen (Beispielkorpora: `sources/recht-nrw/term-<id>/`;
Bulk: R2 `landesrecht-quellen`).

Spätere Änderungen der Simulation entstehen als neue Fassungsdateien, nie durch Umschreiben von
`versions/2023-12-01.json`. Eine Neuerzeugung der Ausgangsfassungen durch den Importer (z. B. nach einer
Transformerkorrektur) wird gegenüber einem bestimmten Basis-Commit freigegeben: entweder einmalig mit
`node scripts/check-version-immutability.ts --allow west/<slug>/2023-12-01` oder dokumentiert in
`data/content-immutability-exceptions.json` (`baseCommit`, je Fassung `kind` und Begründung). Die Datei
gilt nur für den genannten Basis-Commit und verfällt mit dem nächsten Commit von selbst.

## Testbestand

Der synthetische Bestand liegt getrennt unter `tests/fixtures/content/` (gleiche Struktur wie `content/`):
`testfixture-schulgesetz-west` („Testfixture Schulgesetz …“, zwei Fassungen, Quellintervall 2023-08-01 bis
2024-01-31), `kuestenschutzgesetz-nsh`, `testverordnung-ost` (OstRecht-Format mit zitierter Vorschrift),
`gemeindeordnung-baywue` (Artikelgliederung) und die Verkündung `gv-west-2026-12`. Jede Fixture-Norm trägt
`"dataset": "synthetic-fixture"` in `meta.json`. Schutzregeln: `npm run content:validate` lehnt Fixtures
unter `content/` ab, die D1-Projektion (`scripts/project-d1.ts`, `d1:seed:dev`) projiziert nie Fixtures,
das Suchaudit meldet Fixture-Treffer in Produktionsergebnissen. Tests laden den Fixture-Bestand über
`tests/helpers/fixture-corpus.ts`.
