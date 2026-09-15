# Architektur

## Überblick

```text
content/norms/<jur>/…  (Git, Source of Truth)
        │  scripts/project-d1.ts  →  packages/runtime/projection.ts (deterministischer Plan)
        ▼
D1 je Jurisdiktion: landesrecht-west | landesrecht-nsh | landesrecht-ost | landesrecht-baywue
        │  packages/runtime/d1-store.ts (NormStore je Jurisdiktion)
        ▼
packages/runtime/registry.ts (StoreRegistry: get(jur), search über alle Stores + mergeSearchPages)
        │
        ▼
apps/web (Astro im Cloudflare Worker): Seiten, /api/v1, /.well-known/simrecht.json
        │
        ├─ packages/providers: ContentProvider (intern), OstRechtProvider (extern), FederalProvider (extern)
        └─ packages/providers/resolver.ts: LegalReference → Zieladresse

R2 landesrecht-quellen: unveränderte Rohquellen (Objektschlüssel <jur>/<system>/<stichtag>/<datei>)
```

Ohne Worker (Dev, Prerendering, Tests) ersetzt `createFileNormStore` den D1-Store; beide
implementieren dieselbe `NormStore`-Schnittstelle (`packages/runtime/src/store.ts`).

## Pakete

| Paket | Verantwortung |
| --- | --- |
| `@landesrecht/legal-core` | Jurisdiktionsregister und Stichtag, kanonisches Schema mit fail-closed Parsern, Zeitmodell/Fassungsauflösung, Body-Helfer (Sprungziele, Inhaltsübersicht, Strukturadressen), Routen, Rechtsverweise, Vokabular, Dateiloader (Node) |
| `@landesrecht/search` | Sucheinheiten aus dem Normkörper, Abfrageplan (Strukturadressen, Phrasen, Token, Filter), FTS5-Vertrag (Spalten, Gewichte, Trigger), In-Memory-Bewertung, Zusammenführung mehrerer Stores |
| `@landesrecht/runtime` | Bindings, Projektionsplan, D1-Store, Dateistore, Registry, SQLite-Adapter (D1-kompatibel, nur Node) |
| `@landesrecht/providers` | `LegalProvider`-Schnittstelle, Content-Provider, OstRecht-Adapter + Provider, Bundesrechts-Provider, zentraler Resolver |
| `@landesrecht/importer-*` | Pipeline-Schnittstellen (`common`); `importer-recht-nrw` mit `common/` (Fetcher, Fassungsseite, lokale Stichtagsauswahl, Parserbausteine, Integrität, Manifest, Review-Queue, Coverage), `lrgv/` (Gesetze, Verordnungen), `lrmb/` (Verwaltungsvorschriften: Klassifikation, Parser, Ministerialblatt, Stichtagsbelege, Rekonstruktion), `transform/` (Erkennung, Regeln, Erlassorgane, Transformation), CLI; Platzhalter für juris SH, BAYERN.RECHT, OstRecht-Leser |

## Jurisdiktionsmodell

Genau ein Register (`jurisdictions.ts`): IDs `west|nsh|ost|baywue`, öffentliche Namen und
Kurzbezeichnungen, URL-Segmente (`bayern-wuerttemberg`), `baselineDate` (immer
`SIMULATION_BASELINE_DATE`), Quellportal, Verkündungsblatt, optional `externalSourceOfTruth`
(nur Ost → OstRecht). Alle anderen Module lesen daraus.

## Zeitmodell

- Simulationsachse (`simulationValidFrom/To`): entscheidet über Geltung, Fassungsauflösung
  (`resolveVersionAt`, `getApplicableVersion`) und Klassifikation (`current|historical|future|unknown-effective`)
  relativ zum redaktionellen Stichtag.
- Quellachse (`sourceValidFrom/To`): Provenienz der übernommenen realen Fassung; nie
  geltungsrelevant. Beispiel Ausgangsfassung West: Simulation ab 2023-12-01, Quelle 2023-08-01 bis 2024-01-31.
- Ausgangsfassungen beginnen nie vor dem Ausgangsrechtsstand (`assertBaselineConsistency`).
- Provenienz je Fassung: reale Fundstelle (`sourceCitation`) und Quellenlage (`sourceStatus`: Intervall
  `exact`/`verified-active-at-baseline`/`reconstructed`, Text `direct`/`reconstructed`); beides ändert
  keine Geltung.

## Laufzeit und D1-Aufteilung

- Eine D1-Datenbank je Jurisdiktion; Bindings und Datenbanknamen in `bindings.ts`.
- Die Anwendung nimmt nie an, dass alle Normen in einer Datenbank liegen: jede Seite holt sich den
  Store der Jurisdiktion aus der Registry; die Suche über „alle Länder“ fragt jeden Store bis
  `offset + limit` ab und führt global zusammen (`mergeSearchPages`).
- Für Tests und lokale Seeds läuft dieselbe Projektion in `node:sqlite` (Migrationen aus `data/d1/`).

## Suche

Übernommen aus OstRecht: Provisionen als Sucheinheiten mit Strukturadressen
(`references_json`: Paragraph/Artikel/Absätze), zitierter Text keine Trefferstelle,
FTS5-Index mit externem Inhalt und Triggern, zweischichtige MATCH-Strategie (OR-Ausdruck für
`rank`, je Begriff eine AND-Bedingung), bm25-Gewichte positionsgebunden an den Spaltenvertrag,
Strukturadressen als JSON1-Prädikate, Kandidaten in SQL + Bewertung der Seite im Speicher,
fail-safe Zustandsparser. Neu: `jurisdiction`-Spalte, Sucheinheiten für alle Fassungen (Suche nach
Geltungstag `validOn`), Zusammenführung mehrerer Stores.

## Importer

Der RECHT.NRW-Importer (`docs/RECHT_NRW_IMPORT.md`, `docs/RECHT_NRW_LRMB_IMPORT.md`) ist der erste
produktionsnahe Quellimporter mit zwei Quellbereichen: LRGV (Gesetze, Rechtsverordnungen) und LRMB
(Verwaltungsvorschriften). Parser (Nordrhein-Westfalen bleibt Nordrhein-Westfalen) und Transformer
(→ Land Westdeutschland) sind getrennte Phasen; die Stichtagsauswahl ist lokal fail-closed; landesbezogene
Bezeichnungen werden vor der Transformation erkannt und entschieden, danach geprüft; Erlassorgane stammen
nur aus ausdrücklichen Formeln; Quellmetadaten (URLs, Hashes, Quellintervall, reale Fundstellen,
Aktenzeichen) werden nie transformiert. LRMB-Dokumente brauchen Belege für Geltung und Textstand am
Stichtag; Rekonstruktionen nur mit geprüftem Rezept. Manifest, Review-Queue und Coverage sind gemeinsam.
Status: validierte Beispielkorpora (12 LRGV, 15 LRMB) – noch kein vollständiger Ausgangsimport
(`docs/RECHT_NRW_BULK_IMPORT.md`). Umfang des Bestands: `docs/LEGAL_SCOPE.md`.

## Provider und Verweise

`LegalProvider` trennt internes Modell und externen Lieferanten. Der Resolver bildet je
Rechtsordnung genau einen Provider ab (Reihenfolge = Priorität): `bund` → FederalProvider
(`gesetze-sim-internet.de/gesetz.php?g=<abk>`), `ost` → OstRechtProvider (öffentliches OstRecht,
bis ostdeutsche Normen intern vorliegen), `west|nsh|baywue` → ContentProvider (interne Route mit
Sprungziel der Vorschrift).

## Aus OstRecht übernommen

- Dateistruktur `meta.json`/`history.json`/`versions/*.json` mit unveränderlichen Snapshots.
- Body-Block-Modell (17 Typen wörtlich) samt Tabellenprüfung; Sprungziel-Schema
  (`paragraph-3`, `artikel-5`, `zitat-…`), Inhaltsübersicht.
- Fassungsklassifikation aus Intervall und Stichtag statt gespeichertem `isCurrent`.
- Bezeichnungslogik (`getNormVersionIdentity`, Aliasse, öffentliche Zusammenfassung).
- D1-Schema-Grundriss (`law_norms`, `law_versions`, blockweise `law_version_blocks` mit
  `part_index/part_count` und 40 000-Zeichen-Teilen, `law_source_objects`, `law_search_units` +
  `law_search`, `law_runtime_meta`), Plan-Bauweise mit Gruppen, Reset-/Delete-Reihenfolge,
  Meta-Anweisungen zuletzt, Re-Validierung gelesener Zeilen.
- Runtime-Kontext: `cloudflare:workers`-Import mit Rückfall auf Dateistore, dynamischer Import der
  Node-Loader, `prerender = false` für D1-Routen, `Astro.rewrite('/404')`.
- Vokabular-Prinzip („ein Wort je Begriff an einer Stelle“), Trennung von Geltung und
  Änderungsinformation, dauerhafte Fassungslinks vs. dynamischer Normlink.
- Testkonzept mit synthetischem Fixture-Bestand und Wrangler-Konfigurationstest.

## Bewusst nicht übernommen

- `revosax_law_id`, `source_kind`-Check auf `revosax-baseline`, `lawId`/`fsnNumber` als
  Normfelder → generische `externalIdentifiers` und `SourceReference.system/externalId/sourceNumber`.
- `origin_kind` (ostdeutsch-original/inherited-…), `in_inventory`, Änderungsvorschriften-Heuristik
  → keine jurisdiktionspolitischen Klassen im Kern.
- Amtliche sächsische Sachgebietssystematik und Förderbereichsnummern → freie Sachgebiete.
- Gazette-spezifische Fundstellenmuster (OGVBl., SächsGVBl., …) in der Suche.
- Portal-/Staatsportal-Kopplung, Wissenshub, Kreisreform, Screenshot-Suite.
- Einheitlicher Slug-Namensraum → `(jurisdiction, slug)` mit ID `<jur>:<slug>`.
- Suchindex nur für die geltende Fassung → alle Fassungen (konfigurierbar).

## Abweichungen von der Auftragsvorlage

- Zusätzliches Paket `packages/runtime` (statt Runtime-Code in `apps/web`), damit Projektion,
  Store und SQLite-Adapter von Skripten und Tests ohne Astro nutzbar sind.
- `content/norms` (nicht `normen`): Feld- und Dateinamen des Modells sind englisch wie in OstRecht
  (`meta.json`, `versions/`), das Verzeichnis folgt dem.
- Vitest statt `node --test` (Auftragsvorgabe); TypeScript läuft trotzdem ohne Build-Schritt.
