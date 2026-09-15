# Datenmodell

Quelle der Wahrheit für Typen und Parser: `packages/legal-core/src/lib/schema.ts`.

## Konzepte

| Konzept | Umsetzung |
| --- | --- |
| Jurisdiction | `Jurisdiction` in `config/jurisdictions.ts` (Register, nicht Content) |
| Norm | `NormMeta` (`meta.json`) |
| NormVersion | `NormVersion` (`versions/<versionId>.json`) mit zwei Zeitachsen |
| NormBodyBlock / Provision | `NormBodyBlock` (rekursiv); Provisionen = `paragraph|article|section|subsection|annex|preamble` |
| SourceReference | `SourceReference` an Norm und Fassung |
| Publication | `Publication` (`content/publications/<jur>/<slug>.json`) |
| NormHistoryEntry | `NormHistoryEntry` in `history.json` |
| NormRelation | `NormRelation` (`meta.relations[]`) mit typisiertem Ziel `{ jurisdiction?, slug }` |
| ExternalIdentifier | `{ system, value, url? }` (`meta.externalIdentifiers[]`) |
| LegalReference | `lib/references.ts`: `{ type: 'legalReference', jurisdiction, norm, provision?, versionId? }` |

## NormMeta (Pflichtfelder fett)

**id** (`<jur>:<slug>`), **slug**, **jurisdiction**, **title**, shortTitle, abbr, shortTitleSource,
**type** (`verfassung, gesetz, verordnung, verwaltungsvorschrift, foerderrichtlinie,
allgemeinverfuegung, bekanntmachung, berichtigung, staatsvertrag, verwaltungsabkommen,
zustimmungsgesetz, aenderungsvorschrift, satzung`), **status** (`in-force, future-effective,
pending-effective, repealed, historical, one-time-act, planned`), enactingBody,
originEnactingBody, responsibleBody, **subjects**, primarySubject, **keywords**,
**initialCitation**, summary, summarySource, documentDate, publicationDate, effectiveDate,
expiryDate, dateNote, **predecessor** (Text|null), predecessorTarget, **successor**,
successorTarget, relations (Standard `[]`), externalIdentifiers (Standard `[]`),
sourceReferences (Standard `[]`).

## NormVersion

**versionId**, **simulationValidFrom**, **simulationValidTo** (null = offen), sourceValidFrom,
sourceValidTo, title, shortTitle, abbr, summary, **citation**, **changeNote**, sourceReferences,
sourceNotes (`{ label, text }[]`, Quellhinweise/Fußnoten der amtlichen Fassung), **body**.

`validFrom`/`validTo` ohne Präfix werden abgewiesen. Ein `isCurrent`-Flag gibt es nicht; die
Fassungsart ergibt sich aus Intervall und Stichtag (`lib/versions.ts`).

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

Die Spaltenreihenfolge von `law_search` ist Vertrag (`packages/search/src/schema.ts`);
`npm run d1:schema:check` und `tests/unit/d1-projection.test.ts` prüfen sie.
