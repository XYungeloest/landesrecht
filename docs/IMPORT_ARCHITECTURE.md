# Importarchitektur

Gemeinsame Schnittstellen in `packages/importers/common/src/pipeline.ts`; produktionsnah umgesetzt ist der
RECHT.NRW-Importer (West) mit den Quellbereichen LRGV und LRMB. Welche Vorschriften überhaupt übernommen
werden, regelt `docs/LEGAL_SCOPE.md`.

## Pipeline

```text
Enumerate (Sitemaps + Suchindex, Abgleich) → je Stammnorm:
Fetch → Select Source Version at Baseline → Parse Source Format → Document Identity and Body Sanity
  → Classify (Normativität) → Text Completeness (PDF-Policy) → Assess Validity → Archive Raw Source
  → Normalize Source Law → Detect → Transform into Simulation Jurisdiction → Post-Transform Audit
  → Validate → Write Canonical JSON → Checkpoint (Manifest, Review, Enumeration)
→ Project to D1 (voll oder inkrementell, in Batches) → Audit (Coverage, Suche, Readiness)
```

Die Dokumentidentität wird nach dem Parsen und vor jeder Normativitätsentscheidung und jedem Schreiben
geprüft (`consistent | review | mismatch`); `mismatch` wird nie übernommen.

## Bulkbetrieb

| Baustein | Modul | Regel |
| --- | --- | --- |
| Enumeration | `common/enumeration.ts` | `data/imports/recht-nrw/enumeration-<bereich>.json`, deterministisch, Fortschritt je Eintrag (`pending → processing → done/review/failed/excluded`) |
| Bulk-Runner | `common/bulk-runner.ts`, `cli-bulk.ts` | Dry-run Standard; `--resume`, `--limit`, `--only`, `--retry-failed`, `--retry-review`, `--regenerate-stale`; Normfehler → Review/fehlgeschlagen und weiter, systemische Fehler → kontrollierter Abbruch (`aborted-systemic`) |
| Checkpoints | `common/atomic.ts`, `common/persist.ts` | nach jeder Stammnorm atomar (Temp-Datei → fsync → rename); Norm über Temp-Verzeichnis und Austausch; SIGINT/SIGTERM beenden nach der laufenden Norm |
| Abrufe | `common/fetcher.ts` | ein sequenzieller Fetcher, Mindestabstand 1,5 s, Retry-After, Backoff, Abbruch nach wiederholten Sperren, Budgets (Abrufe, Bytes, Laufzeit); `budget-exhausted` ist kein Fehler |
| Cache | `common/fetcher.ts` | `.cache/recht-nrw/` (nicht in Git), SHA-256-geprüft, Offline-Neuverarbeitung |
| Archiv | `common/archive.ts`, `common/r2-transport.ts` | R2 `landesrecht-quellen`, unveränderliche Objekte mit Rücklesung; ohne Zugangsdaten Staging unter `.cache/` und späterer Upload |
| Zustand | `common/manifest.ts`, `common/review-queue.ts`, `common/slug-registry.ts`, `common/overrides.ts` | je Quelle eine Datei (`manifest/<bereich>/term-<id>.json`, `review/<bereich>/term-<id>.json`), stabile Slugs, dokumentierte Overrides |
| Auswertung | `common/coverage.ts`, `common/search-audit.ts`, `common/readiness.ts` | Coverage (JSON + Markdown), Suchintegrität, READY/NOT READY |

| Phase | Schnittstelle | Ergebnis |
| --- | --- | --- |
| Fetch | `SourceFetcher.fetch(url)` | `RawSource` (Bytes, SHA-256, Abrufzeit) |
| Archive | `SourceArchive.archive(source, jurisdiction)` | `ArchivedSource` (R2-`objectKey` `<jur>/<system>/<stichtag>/<datei>` oder `localSource`) |
| Parse + Normalize | `SourceParser.detect/parse` | `SourceLaw`: echtes Recht des Herkunftslandes (Titel, Kennungen, Quellintervall, Body, Quellen, Befunde) |
| Select | `selectSourceVersionAtBaseline` (Importer) | genau die Quellfassung am Stichtag; **lokal fail-closed** (Befunde an der Stichtagsfassung und ihren Nachbarn blockieren, entfernte historische Befunde sind Warnungen) |
| Detect | Importer (`transform/detection.ts`) | Erkennung, Kategorie und Entscheidung jeder landesbezogenen Bezeichnung auf dem Quelltext |
| Transform | `JurisdictionTransformer.transform(law, context)` | `NormRecord` der Simulationsjurisdiktion; nur sichere Überleitungen; Erlassorgan nur aus ausdrücklicher Formel |
| Post-Transform Audit | Importer | Residuen, nicht angewandte Regeln, stille Änderungen → fail-closed |
| Validate | Parser aus `legal-core`, `validateNormRecord`, `assertBaselineConsistency` | fail-closed |
| Write | `CanonicalWriter.write(record)` | `content/norms/<jur>/<slug>/…` – nur `versions/<Stichtag>.json` |
| Project | `scripts/project-d1.ts` | D1-Plan / lokale SQLite |
| Audit | `ImportAuditEntry` | Manifest, Review-Queue, Reports, Coverage unter `data/` |

Quellparser und Simulationstransformation sind getrennte Phasen. Ein RECHT.NRW-Parser liefert
Nordrhein-Westfalen-Recht; erst der Transformer macht daraus Recht des Landes Westdeutschland.
Analog: Schleswig-Holstein → NSH, Bayern → BayWü, Sachsen/OstRecht → Ost.

## Importer

| Paket | Quelle | Ziel | Stand |
| --- | --- | --- | --- |
| `importer-recht-nrw` | RECHT.NRW: LRGV (Gesetze, Rechtsverordnungen) und LRMB (Verwaltungsvorschriften) | west | **Phase 3 – bulkbereit**: gehärteter Importpfad, validierte Beispielkorpora (12 LRGV, 15 LRMB), vollständige Enumeration beider Bereiche, Bulk-Runner mit Resume/Checkpoints/Budgets, R2-Archiv, Coverage und Readiness-Prüfung; der vollständige Ausgangsimport ist noch nicht gelaufen (`docs/RECHT_NRW_IMPORT.md`, `docs/RECHT_NRW_LRMB_IMPORT.md`, `docs/RECHT_NRW_BULK_IMPORT.md`, `docs/RECHT_NRW_BULK_READINESS.md`) |
| `importer-juris-sh` | juris Schleswig-Holstein | nsh | Platzhalter |
| `importer-bayernrecht` | BAYERN.RECHT | baywue | Platzhalter |
| `importer-ostrecht` | OstRecht-Normordner | ost | Leser + Adapter vorhanden, kein Schreiblauf |

## Verbindliche Regeln für alle Importer

1. Discovery und Abruf nur über einen ausdrücklichen Befehl; Rohquellen unverändert mit SHA-256
   archivieren (`sources/` nur für Beispielkorpora, im Bulkmodus ausschließlich R2 bzw. Staging außerhalb
   von Git – der Bulkmodus bricht sonst ab), Manifest committen.
2. Ausgangsfassung = die am 2023-12-01 geltende Fassung; `sourceValidFrom/To` nur aus Belegen,
   `simulationValidFrom = 2023-12-01`, `simulationValidTo = null`. Nach dem Stichtag gilt
   Simulationsrecht; spätere reale Änderungen werden nie übernommen.
3. Verwaltungsvorschriften nur mit Beleg der Geltung und des Textstands am Stichtag; Rekonstruktionen nur
   mit geprüftem Rezept (Basis, alle Änderungen, Vollständigkeitsbeleg, Schritte, SHA-256, Audit) – nie
   still oder heuristisch.
4. Zweifelhafte Dokumente werden nie automatisch zu Landesrecht erklärt (Normativitätsfilter → Review).
5. Externe Kennungen als `externalIdentifiers` (`system` des Portals), Quellen als Referenzen mit
   `sha256`, `url`, `retrievedAt`; reale Fundstelle (`sourceCitation`) getrennt von der
   Simulationsfundstelle (`citation`, `initialCitation`).
6. Erkennung vor der Transformation; nur sichere Überleitungen; Fundstellen, Aktenzeichen, URLs, Hashes
   und Quellgeltung werden nie transformiert; jede Entscheidung steht im Report; Prüfung nach der
   Transformation ist fail-closed.
7. Keine erfundenen Organe: Erlassorgan nur aus ausdrücklicher Formel, Simulationsorgan nur bei sicherer
   Entsprechung.
8. Keine stillen Fallbacks: jeder nicht erkannte Strukturfall bricht ab oder landet als Review-Fall; Review-
   Fälle verschwinden bei Reimport nicht.
9. Slugvergabe über `TransformContext.reserveSlug` (eindeutig je Jurisdiktion, Kollision → Review).
10. Nach dem Schreiben: `npm run content:check`, `npm run d1:schema:check`, `npm run test`, Importaudit.
