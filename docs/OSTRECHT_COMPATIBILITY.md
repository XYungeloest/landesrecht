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
- Weichen die beiden Stichtage bei der geltenden Fassung voneinander ab, fehlt deren Index – sowohl bei einer
  älteren OstRecht-Projektion als auch bei einer bereits weiter fortgeschriebenen Projektion; `npm run audit:ost-drift` meldet das (`currentVersionsWithoutUnits`).
- Übernommene sächsische Änderungsvorschriften gehören in OstRecht nicht zur „Grundmenge“ (`in_inventory = 0`);
  Landesrecht zählt und listet sie wie in den anderen Ländern, ordnet sie in der Suche aber hinter Stammnormen ein.

## Freshness und Such-Readiness

`packages/runtime/src/ostrecht-freshness.ts` vergleicht den Landesrecht-Stichtag (`EDITORIAL_REFERENCE_DATE`) mit dem
Projektionsstand von OstRecht (`law_runtime_meta`: `last_sync_at`, `sync_state`, `projection_fingerprint`; Fenster des
indexierten Stichtags aus `law_versions.temporal_kind`) und nennt jede Norm, deren am Landesrecht-Stichtag geltende
Fassung keine Sucheinheiten hat (geltende und von OstRecht indexierte Fassung). Betroffen sind Normen, deren geltende Fassung
an den beiden Stichtagen verschieden ist. Landesrecht schreibt und synchronisiert OstRecht nie. Ein neuerer
OstRecht-Sync hilft nur bei zurückliegendem Projektionsstand; ist OstRecht bereits weiter, muss die Projektion
zusätzliche Fassungen indexieren. Ein erneuter Sync derselben aktuellen Fassung ergänzt keine historischen Einheiten.

- **Suchabdeckung** (`SearchCoverage`, `NormStore.getSearchCoverage`, `StoreRegistry.searchCoverage`): `readiness`
  (`ready`/`partial`), `fullText` (`all-versions` für West/NSH/BayWü, `current-version-only` für Ost),
  `historicalVersions: navigable`, `staleNormCount`. `/api/v1/search` liefert sie als `coverage`, `/api/v1/jurisdictions`
  als `search`; die Suchseite weist darauf hin, wenn frühere Fassungen gesucht werden oder die Readiness `partial` ist.
- **Health:** `/health` meldet `search.OSTRECHT_RECHT`; bei `partial` (oder nicht prüfbarer Readiness) lautet der
  Status `degraded` (HTTP 200), nie `ok`.
- **Fallback** (`searchStaleOstRechtNorms`): für höchstens 50 betroffene Normen ergänzt die Suche auf der ersten Seite
  Treffer aus Bezeichnung, Abkürzung, Aliassen, Schlagworten und Zusammenfassung der geltenden Fassung (dieselbe
  Bewertung wie für alle Treffer). Kein zweiter Volltextindex: der Normtext dieser Fassung bleibt bis zum OstRecht-Sync
  ohne Volltexttreffer, Anfragen mit Strukturadresse (§/Artikel) werden nicht ergänzt.
- **Drift-Audit:** `npm run audit:ost-drift` gibt den Freshness-Befund mit Normliste aus und endet mit Befund, sobald
  eine Norm betroffen ist; `--as-of <Datum>` prüft einen künftigen Stichtag vorab.

## Schema-Contract und Drift

Vor dem ersten Zugriff (je Binding zwischengespeichert, 5 Minuten; Fehlschlag 15 Sekunden) prüft der Adapter Tabellen
und Spalten (`OSTRECHT_CONTRACT_COLUMNS`), die JSON-Grundstruktur einer Stichprobe, FTS5 über `law_search_units` und
`law_runtime_meta` (`sync_state = complete`, `projection_fingerprint`, `corpus_hash`, `last_sync_at`, `norm_count`).
Jede Abweichung ist ein `OstRechtContractError` → HTTP 500 über die Middleware, keine halbgültige Auslieferung.
`npm run audit:ost-drift` prüft zusätzlich Zähler, Store-Stichprobe, Suchparität und Verkündungen; optional gegen
das OstRecht-Git (`--ostrecht-root`, nur lesend). `/api/v1/jurisdictions` gibt für Ost `runtime` (Sync-Zustand,
Zeitpunkt, `upstreamCorpusHash`, `projectionFingerprint`) aus.

Das gilt für jeden gebauten Worker. Nur im lokalen Entwicklungsbetrieb (`astro dev`) ist eine fehlende oder schemalose
lokale `OSTRECHT_RECHT` ein erwarteter Zustand: Ost ist `unavailable-local` (503 für Ost-Anfragen, `availability` in
`/api/v1/jurisdictions`, `/health` `degraded`), die übrigen Länder bleiben nutzbar. Eine lokale Kopie ist `fixture`
(development only) und nie der vollständige Bestand (`docs/MAINTENANCE.md`, `tests/unit/web-local-dev.test.ts`).

## Prüfung

- `tests/unit/ostrecht-d1-store.test.ts` – Fixture `tests/fixtures/ostrecht/ostrecht-recht.sql` (Auszug aus einem
  OstRecht-Seed, `npm run fixture:ostrecht`): Normliste, aktuelle Norm, Mehrfachfassungen, Baseline-Regel, ausgeschlossene
  Norm, eigene Sim-Norm, Änderungsgesetz, aufgehobene und künftige Norm, Historie, Relationen, Quellen, Verkündungen,
  Suche (Bezeichnung, Alias, Strukturadresse, Fassungsart), Suchdokument- und Verkündungsadapter, Cross-Jurisdiction,
  Statistik/Metadaten, Drift-Audit, Freshness, Such-Fallback und Suchabdeckung.
- `tests/unit/ostrecht-contract.test.ts` – Read-only-Hülle, Contract (fail closed bei `sync_state`, Spalten, Tabellen,
  JSON), Bindings/Registry (`OSTRECHT_RECHT`, `LANDESRECHT_OST` unbenutzt), Konfiguration, Healthcheck.
- `tests/unit/ostrecht-compatibility.test.ts` – Adapter auf Dateiebene, optional gegen `../staatsregierung`.

## Bewusst nicht übernommen

REVOSax-Spalten und -Felder im Kern, `origin_kind`/Inventarregeln, sächsische Sachgebietssystematik,
Gazette-Muster der Suche, Konsolidierungs- und Rechtsüberleitungsskripte (sie bleiben OstRecht-Werkzeuge).

## Abweichende Stichtage: Diagnose und Änderungsvorschlag

Lesende Remote-Abfragen zeigen für Landesrecht (`EDITORIAL_REFERENCE_DATE = 2026-09-28`) folgende
Konstellation. Die Intervalle stammen unverändert aus `law_versions`; `temporal_kind` beschreibt den
OstRecht-Projektionsstand, nicht den Landesrecht-Stichtag.

| Norm / OstRecht-Slug | Landesrecht-Fassung und Intervall (inklusive) | temporal_kind in D1 | Sucheinheiten dieser Fassung | Indexierte Fassung / Intervall | Sucheinheiten / FTS-Treffer |
| --- | --- | --- | ---: | --- | ---: |
| Bezirksordnung / `ostdeutsche-bezirksordnung` | `2026-08-01`, 2026-08-01 bis 2026-09-30 | historical | 0 | `2026-10-01`, ab 2026-10-01 ohne Ende, current | 29 / 29 |
| Gemeindeordnung / `saechsische-gemeindeordnung` | `2026-09-12`, 2026-09-12 bis 2026-09-30 | historical | 0 | `2026-10-01`, ab 2026-10-01 ohne Ende, current | 151 / 151 |
| Landkreisordnung / `saechsische-landkreisordnung` | `2026-08-01`, 2026-08-01 bis 2026-09-30 | historical | 0 | `2026-10-01`, ab 2026-10-01 ohne Ende, current | 78 / 78 |

Alle Fassungen haben jeweils einen Eintrag in `law_search_documents`; das ist kein Volltextindex.
Die indexierten Einheiten verteilen sich auf 28 Paragraphen + Metadaten, 149 Paragraphen + Ergänzungstext
+ Metadaten beziehungsweise 76 Paragraphen + Ergänzungstext + Metadaten. Die FTS-Stichprobe mit
`gemeinde* OR bezirk* OR landkreis* OR ostdeutsch*` erreicht alle vorhandenen Einheiten dieser drei Normen.
Der zusätzliche Abgleich der aus `law_version_blocks` zusammengesetzten Oktober-Normkörper mit
`collectBodyUnits` findet bei allen drei Normen keine fehlenden oder zusätzlichen Vorschriften;
Ergänzungstext und Metadateneinheit sind ebenfalls vorhanden, soweit erwartet. Der Freshness-Befund
ist somit kein übersehener Index der Septemberfassungen.

`law_runtime_meta` meldet `sync_state=complete`, `sync_mode=incremental`, `projection_scope=full` und
`last_sync_at=2026-10-16T08:56:04.611Z`. Der genaue Projektionsstichtag ist dort nicht gespeichert.
Aus `max(valid_from WHERE temporal_kind='current')` und
`min(valid_from WHERE temporal_kind='future')` folgt das Fenster **2026-10-01 ≤ Stichtag < 2026-10-15**.
Das ist eine Eingrenzung, kein Beleg für einen exakten Tag. Der lokal lesbare Schwestercheckout nennt
in `packages/shared/src/config/editorial.json` noch 2026-09-12 und belegt deshalb nicht den Remote-Stichtag.
Die späteren Fassungen sind neu indexiert; es gibt bei diesen Normen keinen Hinweis auf einen abgebrochenen
Sync. Die Einschränkung entsteht durch die bewusste Ein-Fassungs-Projektion.

### Vorschlag für OstRecht (hier nicht ausgeführt)

Für vollständige Landesrecht-Suche am abweichenden Stichtag braucht es zusätzliche Fassungen im
vorgelagerten Index. Ein bloßer Teilsync der drei Normen mit dem bisherigen Algorithmus genügt nicht.
Konkreter Vorschlag nach separater Entscheidung und Prüfung im aktuellen Schwestercheckout:

1. `../staatsregierung/scripts/sync-recht-d1.mjs`, `normQueries`: Die Schleife über `versions` erzeugt
   bereits alle Suchdokumente, überspringt aber Sucheinheiten für `version.versionId !== current.versionId`.
   Diese Einschränkung für eine Projektion aller Fassungen aufheben. Beim INSERT `version.versionId`
   und `getNormVersionIdentity(norm, version)` verwenden, nicht `current.versionId` und `currentIdentity`.
   `current_version_id`, Intervalle und `temporal_kind` bleiben an den eigenen OstRecht-Stichtag gebunden.
   Die vorhandenen versionierten Schlüssel und Indizes können weiterverwendet werden; kein neues D1-Binding.
2. In derselben Datei `runtimeMetaQueries` den tatsächlichen `asOf` als `projection_reference_date` und
   den Indexumfang als `search_index_scope=all-versions` speichern. Metadaten erst am erfolgreichen Ende
   setzen; die bestehenden Fingerabdruck-, Budget- und Sync-Gates unverändert anwenden.
3. `../staatsregierung/tests/recht-d1-sync.test.mjs` und `recht-d1-reference-date.test.mjs` erweitern:
   Septemberfassung und Oktoberfassung gemeinsam im FTS, Suche je Geltungstag ohne Textübertritt,
   Defaultsuche weiterhin nur zum eigenen Stichtag, Metadaten-Teilsync und inkrementelle Projektion
   identisch zur frischen Vollprojektion. Snapshot-/Projektionsnachweise entsprechend neu erzeugen.
4. Erst nach Bereitstellung und Contract-Nachweis in Landesrecht die Abdeckungsangabe von
   `current-version-only` auf den belegten Umfang umstellen; Freshness selbst nicht abschwächen.

Zur Vorbereitung im geprüften Schwestercheckout (Befehle sind ein Vorschlag, hier nicht ausgeführt):

```sh
node --test tests/recht-d1-sync.test.mjs tests/recht-d1-reference-date.test.mjs tests/recht-d1-sync-scope.test.mjs
npm run norms:runtime:d1-sync -- --full --dry-run
```

Der Dry-run dient der Größen-/Budgetprüfung nach der Codeänderung. Ein produktiver Schreibbefehl ist
nicht Bestandteil dieser Diagnose. Insbesondere weder `--full` ohne Dry-run ausführen noch den
Stichtag in Landesrecht oder OstRecht zurücksetzen, um den Befund verschwinden zu lassen.
