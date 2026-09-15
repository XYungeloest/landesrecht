# Importarchitektur

Noch nicht implementiert: Scraper, Parser, Bulkimporte. Vorbereitet sind Schnittstellen,
Platzhalter und Regeln (`packages/importers/common/src/pipeline.ts`).

## Pipeline

```text
Fetch → Archive Raw Source → Parse Source Format → Normalize Source Law
  → Select Source Version at Baseline → Transform into Simulation Jurisdiction → Validate
  → Write Canonical JSON → Project to D1 → Audit
```

| Phase | Schnittstelle | Ergebnis |
| --- | --- | --- |
| Fetch | `SourceFetcher.fetch(url)` | `RawSource` (Bytes, SHA-256, Abrufzeit) |
| Archive | `SourceArchive.archive(source, jurisdiction)` | `ArchivedSource` (R2-`objectKey` `<jur>/<system>/<stichtag>/<datei>` oder `localSource`) |
| Parse + Normalize | `SourceParser.detect/parse` | `SourceLaw`: echtes Recht des Herkunftslandes (Titel, Kennungen, Quellintervall, Body, Quellen, Befunde) |
| Select | `selectSourceVersionAtBaseline` (Importer) | genau die Quellfassung, deren reales Intervall den Stichtag enthält; Lücke/Überlappung/Mehrdeutigkeit → Abbruch |
| Transform | `JurisdictionTransformer.transform(law, context)` | `NormRecord` der Simulationsjurisdiktion (Namen, Zitate, Organe übergeleitet); `audit()` prüft Reststellen |
| Validate | Parser aus `legal-core`, `validateNormRecord`, `assertBaselineConsistency` | fail-closed |
| Write | `CanonicalWriter.write(record)` | `content/norms/<jur>/<slug>/…` |
| Project | `scripts/project-d1.ts` | D1-Plan / lokale SQLite |
| Audit | `ImportAuditEntry` | `data/audits/` |

Quellparser und Simulationstransformation sind getrennte Phasen. Ein RECHT.NRW-Parser liefert
Nordrhein-Westfalen-Recht; erst der Transformer macht daraus Recht des Landes Westdeutschland.
Analog: Schleswig-Holstein → NSH, Bayern → BayWü, Sachsen/OstRecht → Ost.

## Importer

| Paket | Quelle | Ziel | Stand |
| --- | --- | --- | --- |
| `importer-recht-nrw` | RECHT.NRW (LRGV) | west | **Phase 2**: Fetcher, Parser (Legacy + nativ), Stichtagsauswahl, Transformer, Integritätsprüfung, Manifest, CLI; validierter Beispielkorpus, noch kein Bulkimport (`docs/RECHT_NRW_IMPORT.md`) |
| `importer-juris-sh` | juris Schleswig-Holstein | nsh | Platzhalter |
| `importer-bayernrecht` | BAYERN.RECHT | baywue | Platzhalter |
| `importer-ostrecht` | OstRecht-Normordner | ost | Leser + Adapter vorhanden, kein Schreiblauf |

## Regeln des RECHT.NRW-Importers (umgesetzt)

1. Discovery und Abruf nur über einen ausdrücklichen Befehl; Rohquellen unverändert mit SHA-256
   archivieren (`sources/` lokal, R2 produktiv), Manifest committen.
2. Ausgangsfassung = die am 2023-12-01 in NRW geltende Fassung; `sourceValidFrom/To` aus der
   Quelle, `simulationValidFrom = 2023-12-01`, `simulationValidTo = null`.
3. Externe Kennungen als `externalIdentifiers` (`system: recht-nrw`), Quelle als
   `official-portal-snapshot` mit `externalId`.
4. Transformation deterministisch aus dem unveränderten Parse; Reststellenprüfung fail-closed
   (Bezeichnungen des realen Landes dürfen im übergeleiteten Recht nicht verbleiben).
5. Keine stillen Fallbacks: jeder nicht erkannte Strukturfall bricht ab oder landet als Befund im Audit.
6. Slugvergabe über `TransformContext.reserveSlug` (eindeutig je Jurisdiktion).
7. Nach dem Schreiben: `npm run content:check`, `npm run d1:schema:check`, `npm run test`.
