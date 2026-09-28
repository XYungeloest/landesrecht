# OstRecht-Kompatibilität und Ost-Anbindung

OstRecht (`../staatsregierung`, `apps/recht`, `content/normen/`) ist das vorgelagerte Quellsystem für den
Freistaat Ostdeutschland (`upstreamSourceOfTruth` in `jurisdictions.ts`). Landesrecht liefert diesen Bestand aus,
pflegt ihn nicht, kopiert ihn nicht und besitzt bewusst keine zweite kanonische Ost-Rechtsdatenbank: kein
`content/norms/ost`, keine Verkündungskopie, kein Ost-Sim-Import, keine eigene Ost-D1 (das frühere Binding
`LANDESRECHT_OST` existiert nicht mehr; `docs/DEPLOYMENT.md`). Neue Ost-Rechtsakte entstehen ausschließlich in OstRecht.

## Datenfluss (Variante A)

```text
OstRecht Git (content/normen, content/verkuendungen) → scripts/sync-recht-d1.mjs (OstRecht)
        ▼
D1 ostrecht-recht (OstRecht-Projektion, Migrationen 0001–0008 von OstRecht; sync_state, projection_fingerprint, corpus_hash)
        │  Binding OSTRECHT_RECHT (nur lesend, packages/runtime/src/read-only-d1.ts)
        ▼
packages/runtime/src/ostrecht-d1-store.ts  (NormStore „ost“: Dialekt `ostrecht` für d1-store.ts)
        ▼
StoreRegistry → Landesrecht Web/API (/ost/…, /api/v1/…/ost/…, Suche über alle Länder)
```

Der generische D1-Store (`d1-store.ts`) ist über einen Schema-Dialekt (`d1-dialect.ts`) parametrisiert; Kandidaten-
wahl, Ranking und Seitenzuschnitt der Suche sind für alle vier Länder identisch. Oberhalb der Store-Schicht gibt es
keine Ost-Sonderlogik.

## Bausteine

- `packages/providers/src/ostrecht.ts` – Adapter OstRecht-Rohdatensatz (`meta.json`, `history.json`,
  `versions/*.json`, hier aus `meta_json`/`history_json`/`version_json` der D1) → kanonischer `NormRecord`,
  einschließlich Baseline-Regel (`alignOstRechtVersionsToBaseline`) und Statusnormalisierung (`adaptOstRechtStatus`).
- `packages/runtime/src/ostrecht-d1-store.ts` – Dialekt und Store: Übersichten mit am Landesrecht-Stichtag
  abgeleiteter geltender Fassung, Suchdokument-Adapter (`adaptOstRechtSearchDocument`), Verkündungsadapter
  (`adaptOstRechtPublication`), Relationen aus `law_norm_derived` (`mergeDerivedRelations`), Laufzeitmetadaten.
- `packages/runtime/src/ostrecht-contract.ts` – Schema-Contract (fail closed) und Cache je Binding.
- `packages/runtime/src/ostrecht-drift.ts`, `scripts/audit-ost-drift.ts` – Drift-/Freshness-Audit.
- `packages/providers/src/ostrecht-provider.ts` – Legacy-Auflösung auf OstRecht-Adressen
  (`https://recht.freistaat-ostdeutschland.de/norm/<slug>/[version/<id>/]#<anker>`) hinter dem ContentProvider.
- `packages/importers/ostrecht` – liest OstRecht-Normordner nur für Tests/Analysen; kein Sync in dieses Repository.

## Abbildung

| OstRecht (D1 `ostrecht-recht`) | Landesrecht |
| --- | --- |
| `law_norms.id = slug`, keine Jurisdiktionsspalte | `id = ost:<slug>`, `jurisdiction = ost`, `externalIdentifiers += { system: ostrecht, value: <slug> }` |
| `meta_json.sourceReferences[].kind = revosax-snapshot`, `lawId`, `fsnNumber` | `official-portal-snapshot`, `system = revosax`, `externalId`, `sourceNumber`; `externalIdentifiers += { system: revosax, value: <lawId>, url }` |
| `structured-html-transcription`, `legacy-/supplementary-markdown-transcription`, `structured-docx-source` | `structured-transcription` (`system = ostrecht`) |
| `amendment-source`, `primary-pdf` | gleichnamig |
| `availability = versioned` + `localSource` (Datei im OstRecht-Repo) | `availability = external` mit `note: OstRecht-Repository: <pfad>` |
| `law_versions.valid_from/valid_to` | `simulationValidFrom/simulationValidTo` |
| OstRecht-Stichtag `2023-11-01` (Ausgangsfassungen) | Baseline-Regel: die am `2023-12-01` geltende OstRecht-Fassung beginnt hier am `2023-12-01`; `versionId` und Quellgeltung bleiben; früher endende Fassungen entfallen; eine Norm ohne Fassung am Ausgangsrechtsstand ist nicht im Bestand (Liste, Übersicht, Datensatz, Suche). Eigene Ost-Sim-Normen bleiben unverändert |
| `temporal_kind`, `is_current`, `current_version_id`, `current_valid_from`, `last_change_date` (OstRecht-Stichtag) | entfallen; aus Intervall, Status und Landesrecht-Stichtag beim Lesen abgeleitet (`classifyNormVersion`, Übersichtsspalten per Unterabfrage) |
| `law_search_documents.document_json` (`SearchIndexDocument`) | `SearchDocument` (Kopfdaten; `versionKind` abgeleitet, `simulationValidFrom` an die Baseline geklemmt, Ost-URLs) |
| `law_search_units.provision_path` + FTS5 `law_search` (externer Inhalt) | Sucheinheiten und Index unverändert genutzt (`unit_index = CAST(provision_path AS INTEGER)`); kein eigener Ost-Suchindex |
| `law_publications.publication_json` (OstRecht-Verkündungsdatei) | `Publication`: `publication` → `gazette`, Ausgabebezeichnungen → `alternativeDesignations`, `pdf` → externe `primary-pdf`-Quelle auf OstRecht; Einträge ohne `normSlug` (etwa Staatsanzeiger-Beschlüsse) sind keine Normeinträge |
| `law_norm_derived.relations_json` (`amends`, `amended-by`, `repeals`, `repealed-by`, `enacts`, `enacted-by`, …) | ergänzt `meta.relations` (Titel und Fundstelle als `note`), ohne Metadaten-Relationen zu doppeln |
| `law_runtime_meta`: `last_sync_at`, `sync_state`, `projection_fingerprint`, `corpus_hash`, `search_document_count` | `getStats()` (Zähler aus dem Bestand), `getRuntimeMeta('projection_state'|'last_projected_at'|'version_count')` abgebildet, übrige Schlüssel durchgereicht |
| Status-Aliasse (`published`, `aufgehoben`, `draft`) | normalisiert |
| Body-Blöcke (17 Typen), `law_version_blocks` mit `part_index/part_count` | unverändert |

## Grenzen von Variante A

- OstRecht indexiert Sucheinheiten nur für die an seinem Stichtag geltende Fassung. Frühere Fassungen sind über
  Fassungsnavigation, Versionsseiten und API vollständig erreichbar, aber nicht volltextsuchbar (`versionScope`
  `historical`/`all`, `validOn` liefern für Ost nur indexierte Fassungen). Ein eigener Ost-Suchindex (Variante B)
  ist nur bei realem Bedarf vorgesehen.
- Läuft der Landesrecht-Stichtag einer künftigen OstRecht-Fassung voraus, bevor OstRecht neu synchronisiert, fehlt der
  dann geltenden Fassung der Index; `npm run audit:ost-drift` meldet das (`currentVersionsWithoutUnits`).
- Übernommene sächsische Änderungsvorschriften gehören in OstRecht nicht zur „Grundmenge“ (`in_inventory = 0`);
  Landesrecht zählt und listet sie wie in den anderen Ländern, ordnet sie in der Suche aber hinter Stammnormen ein.

## Schema-Contract und Drift

Vor dem ersten Zugriff (je Binding zwischengespeichert, 5 Minuten; Fehlschlag 15 Sekunden) prüft der Adapter Tabellen
und Spalten (`OSTRECHT_CONTRACT_COLUMNS`), die JSON-Grundstruktur einer Stichprobe, FTS5 über `law_search_units` und
`law_runtime_meta` (`sync_state = complete`, `projection_fingerprint`, `corpus_hash`, `last_sync_at`, `norm_count`).
Jede Abweichung ist ein `OstRechtContractError` → HTTP 500 über die Middleware, keine halbgültige Auslieferung.
`npm run audit:ost-drift` prüft zusätzlich Zähler, Store-Stichprobe, Suchparität und Verkündungen; optional gegen
das OstRecht-Git (`--ostrecht-root`, nur lesend). `/api/v1/jurisdictions` gibt für Ost `runtime` (Sync-Zustand,
Zeitpunkt, `upstreamCorpusHash`, `projectionFingerprint`) aus.

## Prüfung

- `tests/unit/ostrecht-d1-store.test.ts` – Fixture `tests/fixtures/ostrecht/ostrecht-recht.sql` (Auszug aus einem
  OstRecht-Seed, `npm run fixture:ostrecht`): Normliste, aktuelle Norm, Mehrfachfassungen, Baseline-Regel, ausgeschlossene
  Norm, eigene Sim-Norm, Änderungsgesetz, aufgehobene und künftige Norm, Historie, Relationen, Quellen, Verkündungen,
  Suche (Bezeichnung, Alias, Strukturadresse, Fassungsart), Suchdokument- und Verkündungsadapter, Cross-Jurisdiction,
  Statistik/Metadaten, Drift-Audit.
- `tests/unit/ostrecht-contract.test.ts` – Read-only-Hülle, Contract (fail closed bei `sync_state`, Spalten, Tabellen,
  JSON), Bindings/Registry (`OSTRECHT_RECHT`, `LANDESRECHT_OST` unbenutzt), Konfiguration, Healthcheck.
- `tests/unit/ostrecht-compatibility.test.ts` – Adapter auf Dateiebene, optional gegen `../staatsregierung`.

## Bewusst nicht übernommen

REVOSax-Spalten und -Felder im Kern, `origin_kind`/Inventarregeln, sächsische Sachgebietssystematik,
Gazette-Muster der Suche, Konsolidierungs- und Rechtsüberleitungsskripte (sie bleiben OstRecht-Werkzeuge).
