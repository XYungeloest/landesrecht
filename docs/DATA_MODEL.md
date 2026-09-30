# Datenmodell

Quelle der Wahrheit für Typen und Parser: `packages/legal-core/src/lib/schema.ts`.

## Konzepte

| Konzept | Umsetzung |
| --- | --- |
| Jurisdiction | `Jurisdiction` in `config/jurisdictions.ts` (Register, nicht Content) |
| Norm | `NormMeta` (`meta.json`) |
| NormVersion | `NormVersion` (`versions/<versionId>.json`) mit zwei Zeitachsen |
| NormBodyBlock / Provision | `NormBodyBlock` (rekursiv); Provisionen = `paragraph|article|section|subsection|annex|preamble` |
| SourceReference | `SourceReference` an Norm und Fassung; `kind` aus `SOURCE_KINDS` – reale Belege (`official-portal-snapshot`, `official-gazette`, `structured-transcription`, `amendment-source`, `provider-record`, `primary-pdf`) und Sim-Belege `SIMULATION_SOURCE_KINDS` (`simulation-gazette`, `simulation-standalone-act`, `simulation-promulgation-evidence`, `simulation-amendment-source`; `system: "simulation"`, kein `externalId`, keine Quellgültigkeit, bei `r2-archived` ohne `url`/`retrievedAt`, optional `publicationSlug` auf `content/publications/<jur>/<slug>.json`) |
| Publication | `Publication` (`content/publications/<jur>/<slug>.json`): `slug`, `jurisdiction`, `title`, `gazette` (Blattkürzel wie gedruckt/historisch), `seriesTitle?`, `regime?`, `place?`, `year`, `issue`, `date`, `sourceReferences`, `entries[]` (`title`, `type?` Normtyp, `citation`, `normSlug`, `versionId?`, `pages?`, `startPage?`, `documentDate?`) |
| NormHistoryEntry | `NormHistoryEntry` in `history.json` |
| NormRelation | `NormRelation` (`meta.relations[]`) mit typisiertem Ziel `{ jurisdiction?, slug }` |
| ExternalIdentifier | `{ system, value, url? }` (`meta.externalIdentifiers[]`) |
| LegalReference | `lib/references.ts`: `{ type: 'legalReference', jurisdiction, norm, provision?, versionId? }` |

## NormMeta (Pflichtfelder fett)

**id** (`<jur>:<slug>`), **slug**, **jurisdiction**, **title**, shortTitle, abbr, shortTitleSource,
**type** (`verfassung, gesetz, verordnung, verwaltungsvorschrift, allgemeine-verwaltungsvorschrift, runderlass, richtlinie, durchfuehrungserlass, foerderrichtlinie,
allgemeinverfuegung, bekanntmachung, berichtigung, staatsvertrag, verwaltungsabkommen,
zustimmungsgesetz, aenderungsvorschrift, satzung`), **status** (`in-force, future-effective,
pending-effective, repealed, historical, one-time-act, planned`), enactingBody,
originEnactingBody, responsibleBody, **subjects**, primarySubject, **keywords**,
**initialCitation** (Simulation), sourceCitation (reale Quelle, nie transformiert), summary, summarySource, documentDate, publicationDate, effectiveDate,
expiryDate, dateNote, **predecessor** (Text|null), predecessorTarget, **successor**,
successorTarget, relations (Standard `[]`), externalIdentifiers (Standard `[]`),
sourceReferences (Standard `[]`).

## NormVersion

**versionId**, **simulationValidFrom**, **simulationValidTo** (null = offen), sourceValidFrom,
sourceValidTo, sourceCitation, sourceStatus (`validity: exact|verified-active-at-baseline|reconstructed`, `text: direct|reconstructed`, note), title, shortTitle, abbr, summary, **citation**, **changeNote**, sourceReferences,
sourceNotes (`{ label, text }[]`, Quellhinweise/Fußnoten der amtlichen Fassung), **body**.

`validFrom`/`validTo` ohne Präfix werden abgewiesen. Ein `isCurrent`-Flag gibt es nicht; die
Fassungsart ergibt sich aus Intervall und Stichtag (`lib/versions.ts`).

**Abgeleitetes Fassungsende (S1).** Gespeicherte Fassungsdateien tragen `simulationValidTo: null`; sie werden
nie fortgeschrieben (Baseline-Unveränderlichkeit). `validateNormRecord` (`deriveVersionIntervals`) setzt beim
Laden das wirksame Ende: Vortag des Beginns der Folgefassung, bei der letzten Fassung `meta.expiryDate`
(Außerkrafttreten = letzter Geltungstag, bei einer Aufhebung der Vortag ihres Wirkdatums), sonst offen. Ein
explizit gespeicherter Wert bleibt zulässig, muss aber dem abgeleiteten entsprechen. Loader, D1-Store,
Projektion (`law_versions.simulation_valid_to`), Web und API arbeiten auf dem abgeleiteten Wert.

**Provenienztrennung (S3, `lib/provenance.ts`).** Eine Sim-Fassung (`simulationValidFrom` nach dem
Ausgangsrechtsstand) trägt weder `sourceValidFrom`/`sourceValidTo`, `sourceStatus` noch `sourceCitation` und
ausschließlich Sim-Belege (mindestens einen); die Baseline-Fassung trägt keinen Sim-Beleg. Eine eigene Sim-Norm
(ohne Baseline-Fassung) hat `externalIdentifiers: []`, keine `sourceCitation`, kein `originEnactingBody` und in
`meta.sourceReferences` nur Sim-Belege. Extern gepflegte Jurisdiktionen (`externalSourceOfTruth`, Ost) sind
ausgenommen. Der Loader (`loadNorm`) erzwingt die Regel (Gate G5).

### Zeitmodell

```text
simulationValidFrom = 2023-12-01   sourceValidFrom = 2023-08-01
simulationValidTo   = null         sourceValidTo   = 2024-01-31
```

Die Simulationsachse ist geltungsrelevant (`resolveVersionAt(record, date)`,
`getApplicableVersion(record, asOf)`, `classifyNormVersion`), die Quellachse dokumentiert die
reale Herkunft. Intervalle der Simulationsachse sind lückenlos (Folgefassung beginnt am Tag nach
`simulationValidTo` der Vorfassung) und überschneidungsfrei.

## Body-Blöcke

| Typ | Bedeutung | Pflicht |
| --- | --- | --- |
| `book`, `part`, `chapter`, `section`, `subsection` | Buch, Teil, Kapitel, Abschnitt, Unterabschnitt | `title` oder `label`; `children` |
| `paragraph`, `article` | Paragraph, Artikel | `title` oder `label`; `children` |
| `annex` | Anlage | `title` oder `label`; `children` |
| `preamble` | Vorbemerkung | `children` |
| `heading` | freistehende Überschrift | `title` oder `text` |
| `subparagraph` | Absatz „(1)“ | `label`, `text` oder `children` |
| `paragraphText` | Fließtext/Sätze | `text` |
| `item`, `subitem` | Nummerierung, Buchstabe (mit `level`, `listId`, `numberingStyle`) | `label`, `text` oder `children` |
| `quotedProvision` | zitierter Normtext (Änderungsbefehle) | `children` nicht leer |
| `table`, `tableRow`, `tableHeaderCell`, `tableCell` | Tabellen (`columns`, `scope`, `rowspan`, `colspan`; Gitter wird geprüft) | siehe Parser |
| `footnote` | Fußnote im Text | `label`, `text` |
| `signature` | Unterschriftenblock (`text` Person, `title` Amt, `label` Ort/Datum) | keine `children` |

Sprungziele (`lib/body.ts`): `paragraph-3`, `artikel-5`, `abschnitt-1`, `anlage-2`,
`zitat-paragraph-1`; Kollisionen erhalten `--<pfad>`. Strukturadresse einer Provision:
`{ paragraph|article, subsections[] }`.

## D1-Schema (`data/d1/0001_landesrecht.sql`)

| Tabelle | Inhalt |
| --- | --- |
| `law_norms` | Identität (`id = <jur>:<slug>`, `jurisdiction`, `slug`), Bezeichnungen, Typ, Status, geltende Fassung, Daten, JSON-Spalten (`subjects_json`, `keywords_json`, `aliases_json`, `external_ids_json`, `meta_json`, `history_json`), `sort_key`, `index_letter`, Zähler |
| `law_versions` | Fassungen ohne Körper: beide Zeitachsen, `temporal_kind`, `version_json`, `search_document_json` |
| `law_version_blocks` | äußere Body-Blöcke, bei > 40 000 Zeichen in Teile zerlegt (`part_index`, `part_count`) |
| `law_source_objects` | Quellenreferenzen (Brücke zu R2 `object_key` oder Repository `local_source`) |
| `law_norm_history` | Historieneinträge |
| `law_norm_relations` | typisierte Beziehungen mit Zieljurisdiktion |
| `law_norm_subjects` | Sachgebiete |
| `law_external_identifiers` | `(system, value)` je Norm, Index auf `(system, value)` |
| `law_search_units` | Sucheinheiten aller Fassungen (relational, indexierbar löschbar) |
| `law_search` | FTS5 mit externem Inhalt über `law_search_units`, Tokenizer `unicode61 remove_diacritics 2`, Trigger halten den Index synchron |
| `law_runtime_meta` | `last_projected_at`, `projection_fingerprint`, `projection_state`, `jurisdiction`, `baseline_date`, `reference_date`, `norm_count`, `version_count`, `schema_version` |

`data/d1/0003_simulation_change.sql` ergänzt `law_norms` um die abgeleiteten Spalten `simulation_change_kind` und
`last_simulation_change_date` (Projektionsschema 2, siehe unten).

### Simulationsklassifikation

`classifySimulationChange(record)` (`packages/legal-core/src/lib/simulation-change.ts`) leitet für jede Norm genau eine
Klasse aus den Fassungen ab, nie aus `versionCount`:

| Klasse | Bedeutung | Öffentliche Bezeichnung |
| --- | --- | --- |
| `baseline-unchanged` | Ausgangsfassung (`simulationValidFrom` = `SIMULATION_BASELINE_DATE`), keine spätere Fassung, keine Aufhebung danach | Seit dem Ausgangsstand unverändert (kein Kennzeichen) |
| `baseline-changed` | Ausgangsfassung plus mindestens eine spätere Fassung oder Aufhebung in der Simulation | In der Simulation geändert |
| `simulation-new` | keine Ausgangsfassung, erste Fassung nach dem Stichtag | Neu in der Simulation |

`lastSimulationChangeDate` ist die jüngste Sim-Fassung oder Aufhebung. Die Klassifikation ist fail-closed
(`SimulationChangeError`): keine Fassung, eine Fassung vor dem Stichtag, mehrere Ausgangsfassungen oder eine Aufhebung
vor dem Stichtag brechen die Projektion ab. Die D1-Spalten sind reine Projektion (Filter, Sortierung, Facetten); Ost
berechnet dieselbe Klasse per SQL aus der OstRecht-D1 (`packages/runtime/src/ostrecht-d1-store.ts`). API-Felder:
`simulationChangeKind`, `lastSimulationChangeDate` (additiv).

Die Spaltenreihenfolge von `law_search` ist Vertrag (`packages/search/src/schema.ts`);
`npm run d1:schema:check` und `tests/unit/d1-projection.test.ts` prüfen sie.
