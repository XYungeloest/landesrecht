# Landesrecht – gemeinsames Rechtsportal der vier Länder

Technisches Fundament eines eigenständigen, gemeinsamen Landesrechtsportals der politischen
Simulation für:

| ID       | Öffentliche Bezeichnung        | Kurz  | URL-Segment            | Quellrechtsordnung (real) |
| -------- | ------------------------------ | ----- | ---------------------- | ------------------------- |
| `west`   | Land Westdeutschland           | West  | `/west/`               | Nordrhein-Westfalen (RECHT.NRW) |
| `nsh`    | Land Niedersachsen-Holstein    | NSH   | `/nsh/`                | Schleswig-Holstein (juris SH) |
| `ost`    | Freistaat Ostdeutschland       | Ost   | `/ost/`                | Sachsen (REVOSax) – Bestand in OstRecht |
| `baywue` | Freistaat Bayern-Württemberg   | BayWü | `/bayern-wuerttemberg/`| Bayern (BAYERN.RECHT) |

Verbindlicher Ausgangsrechtsstand aller vier Länder: **2023-12-01**
(`SIMULATION_BASELINE_DATE` in `packages/legal-core/src/config/jurisdictions.ts`, die einzige
Stelle, an der der Stichtag steht). Der redaktionelle Stichtag der Simulation steht in
`packages/legal-core/src/config/editorial.json`.

Das Projekt ist eine politische Simulation; keine Seite ist eine amtliche Veröffentlichung.

## Grundprinzipien

- **Git ist fachlicher Source of Truth**: `content/norms/<jurisdiction>/<slug>/` mit `meta.json`,
  `history.json` und unveränderlichen Fassungs-Snapshots unter `versions/<yyyy-mm-dd>.json`.
- **D1 ist eine abgeleitete Laufzeitprojektion**, je eigener Jurisdiktion eine Datenbank
  (`landesrecht-west`, `-nsh`, `-baywue`), deterministisch aus Git erzeugt. Ost hat keine eigene D1.
- **R2 ist das unveränderliche Quellenarchiv** für amtliche Rohquellen (`landesrecht-quellen`).
- **Zwei Zeitachsen je Fassung**: `simulationValidFrom/To` (Geltung in der Simulation) und
  `sourceValidFrom/To` (Geltung der übernommenen realen Quellfassung).
- **OstRecht bleibt Source of Truth für Ost**: Der Worker liest Ost ausschließlich lesend aus der OstRecht-D1
  `ostrecht-recht` (Binding `OSTRECHT_RECHT`, Schema-Contract fail-closed); nichts wird kopiert, importiert oder
  gepflegt (`docs/OSTRECHT_COMPATIBILITY.md`).
- **Bundesrecht bleibt extern** (`gesetze-sim-internet.de`); der FederalProvider bildet Links an
  genau einer Stelle. Das Bundesportal ist nur erkundet (Discovery, `docs/BUNDESRECHT_COMPATIBILITY.md`), nicht integriert.
- **Ausgangsrechtsstand ≠ Sim-Vollständigkeit**: West, NSH und BayWü sind eingefroren (Baseline FROZEN); die
  Simulationsrechtsfortschreibung ist davon getrennt bewertet und bewusst `PARTIAL` (`docs/SIMULATION_IMPORT.md` §7).
- **Möglichst vollständiger Landesrechtsbestand** je Land zum Ausgangsrechtsstand – Gesetze,
  Verordnungen und landesweite Verwaltungsvorschriften (`docs/LEGAL_SCOPE.md`); nach dem Stichtag gilt
  Simulationsrecht.

## Stack

Node.js ≥ 22.12, npm Workspaces, Astro 7 (Cloudflare-Adapter), TypeScript (strikt), Cloudflare
Workers, D1 (SQLite/FTS5), R2, Vitest, Wrangler. Keine weiteren Frameworks.

## Struktur

```text
apps/web/                 Astro-Anwendung (Seiten, API, Worker-Runtime-Kontext, Wrangler-Konfiguration)
packages/legal-core/      Jurisdiktionsregister, Normdatenmodell, Zeitmodell, Routen, Rechtsverweise, Loader
packages/search/          Sucheinheiten, Abfrageplan, FTS5-Vertrag, Ranking, Zusammenführung
packages/runtime/         D1-Projektionsplan, D1-Store, Dateistore, Store-Registry, SQLite-Adapter, Bindings
packages/providers/       LegalProvider-Schnittstelle, Content-, OstRecht-, Bundesrechts-Provider, Resolver
packages/importers/       Pipeline-Schnittstellen (common), RECHT.NRW-Importer (recht-nrw), juris-sh, bayernrecht, Sim-Rechtsfortschreibung (simulation: Inventar, Konsolidierungsengine, Ledger, R2-Archiv, Vollständigkeit)
content/norms/<jur>/      kanonische Normen (west, nsh, baywue: eingefrorene Stichtagsfassungen und Sim-Fassungen; kein Ost; keine Testfixtures)
content/publications/     Verkündungsblatt-Ausgaben je Jurisdiktion (Simulation; Web /<land>/verkuendungen/, D1 law_publications)
data/simulation/          Sim-Quelleninventar, je Land sources.json (Evidenz), ledger.json (Ereignisse), acts/ und amendments/ (Rezepte), Konsolidierungsmanifest, completeness.json, Baseline-Locks
imports/                  Source-Inbox für neue Sim-Rechtsquellen (Original, nicht versioniert; `npm run sources:intake`, docs/MAINTENANCE.md; Archiv in R2 unter <land>/simulation/)
data/d1/                  D1-Migrationen (Schema)
data/runtime/             lokale SQLite-Projektionen, SQL-Pläne und -Batches, Projektionszustand (generiert, nicht eingecheckt)
data/audits/recht-nrw/    Importberichte je Norm, Belege nicht übernommener Dokumente (lrgv/, lrmb/), coverage.json + COVERAGE.md, runs/, d1-scale.json, bulk-simulation.json
data/imports/recht-nrw/   Enumerationen, Manifest und Review je Quelle (manifest/, review/), Slug-Registry, Overrides, Institutionen-Zuordnung, Korpora, Rekonstruktionsrezepte, Transkriptionen
sources/recht-nrw/        Rohquellen der RECHT.NRW-Beispielkorpora (Fixtures, versioniert); Bulk-Rohquellen nur in R2
scripts/                  Validierung, Projektion (voll/inkrementell/Batches), Schemaprüfung, Unveränderlichkeitsprüfung, Skalierungstest, Bulk-Simulation
tests/                    Vitest; synthetischer Bestand unter tests/fixtures/content/ (lokale SQLite-D1, OstRecht-Kompatibilität)
docs/                     Datenmodell, OstRecht-/Bundesrechts-Kompatibilität, Import, Deployment
```

## Entwicklung

```sh
npm ci
npm run dev              # seedet die lokale Miniflare-D1 (übersprungen, wenn aktuell) und startet den Astro-Dev-Server
npm run d1:seed:dev      # nur der Seed der lokalen Miniflare-D1 (apps/web/.wrangler/state; --force spielt neu ein)
npm run release:check    # Release-Prüfung: Checks, Tests, Content, Freezes, Build, Suche, Ost, Audits (docs/RELEASE_READINESS.md)
npm run sources:intake   # neue Sim-Quellen in imports/ auswerten (Dry-run; docs/MAINTENANCE.md)
npm run sources:needed   # noch zu beschaffende Sim-Quellen (P1/P2/P3)
npm run check            # tsc (Packages, Skripte, Tests) + astro check
npm run test             # Vitest
npm run build            # Astro-Build für Cloudflare Workers (apps/web/dist)
npm run content:check    # Content-Validierung + Unveränderlichkeit gespeicherter Fassungen
npm run d1:schema:check  # Migrationen, Suchvertrag, Projektion, FTS5-Integrität
npm run d1:seed:local    # data/runtime/landesrecht-<jur>.sqlite aus content/ erzeugen
npm run d1:apply:remote  # SQL-Pläne für wrangler d1 execute schreiben (kein Remote-Zugriff)
npm run test:search      # nur Suchtests
npm run test:d1          # nur Projektions- und Runtime-Tests
npm run import:recht-nrw:inspect -- --url <url>   # RECHT.NRW: Fassungsseite analysieren
npm run import:recht-nrw -- --url <url> [--write] # RECHT.NRW: Einzelimport (Dry-run ohne --write)
npm run import:recht-nrw:sample [-- --write]      # RECHT.NRW: Validierungskorpus
npm run import:recht-nrw:lrmb:sample [-- --write] # RECHT.NRW: Verwaltungsvorschriften-Korpus (LRMB)
npm run import:recht-nrw:review                   # RECHT.NRW: offene Review-Fälle (entscheiden mit --decide)
npm run import:recht-nrw:coverage [-- --write]    # RECHT.NRW: Coverage-Report (JSON + COVERAGE.md)
npm run import:recht-nrw:audit                    # RECHT.NRW: Manifest, Rohquellen, Reports, Rekonstruktionen prüfen
npm run import:recht-nrw:enumerate -- --area lrgv|lrmb [--write]   # vollständige Enumeration mit Abgleich
npm run import:recht-nrw:bulk -- --area lrgv|lrmb [--limit n]      # Bulk-Runner (Dry-run ohne --write)
npm run import:recht-nrw:readiness                # READY / NOT READY für den Bulkimport
npm run import:recht-nrw:search-audit             # Suchintegrität des West-Bestands
npm run import:bayernrecht:enumerate -- --area landesrecht|vwv [--offline] # BayWü: Enumeration (Fixpunkt)
npm run import:bayernrecht:scope [-- --write]      # BayWü: Scope-Entscheidung je Dokument
npm run import:bayernrecht:baseline [-- --write]  # BayWü: Stichtagsklassifikation (nur Cache, kein Netz)
npm run import:bayernrecht:sample [-- --write]    # BayWü: Beispielkorpus (28 Normen)
npm run import:bayernrecht:search-audit [-- --sample 0] [--write] # BayWü: Suchprüfung und Golden Set (≥ 100 Anfragen)
npm run import:bayernrecht:restore-baseline-only [-- --write --offline] # BayWü: heute fehlende Stichtagsnormen aus Verkündungen
npm run r2:seed:dev-assets                        # BayWü: Abbildungs-Assets in die lokale Miniflare-R2 (nur lokal)
npm run import:juris-sh:events [-- --write]        # NSH: Ereignisregister nach dem Stichtag (nur Cache, kein Netz)
npm run import:juris-sh:review                    # NSH: offene Review-Fälle
npm run d1:plan -- --jurisdiction west            # SQL-Batches für Remote-D1 (kein Remote-Zugriff)
npm run d1:scale-test                             # D1-Skalierungstest mit synthetischem Bestand
```

Bulkimport: Ablauf, Befehle und GO/No-Go-Checkliste in `docs/RECHT_NRW_BULK_READINESS.md`.

Der Worker liest ausschließlich D1. Auch `astro dev` führt die Worker-Routen in workerd aus und
liest die lokale Miniflare-D1, die `npm run d1:seed:dev` deterministisch aus `content/` befüllt.
Nur außerhalb eines Workers (Prerendering im Node-Build, Skripte, Tests) fällt der Datenzugriff auf
den Dateistore über `content/` zurück (`apps/web/src/lib/runtime/context.ts`).

## Adressen

```text
/                                   Startseite mit gemeinsamer Suche und vier Länderzugängen
/<land>/                            Länderseite mit Typfilter und Bestandsstatus
/<land>/norm/<slug>/                geltende Fassung
/<land>/norm/<slug>/version/<yyyy-mm-dd>/   unveränderliche Fassung
/<land>/norm/<slug>/{daten,historie,vergleich,quellen}/
/<land>/verkuendungen/[<slug>/]     Sim-Verkündungsblätter
/suche/                             Suche über alle oder einzelne Länder
/.well-known/simrecht.json          SimRecht-Deklaration
/health                             Healthcheck (Bindings, Ost-Contract, Such-Readiness)
/api/v1/jurisdictions, /api/v1/norms/{jurisdiction}/{slug}[/versions], /api/v1/publications/{jurisdiction}[/{slug}], /api/v1/search
```

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| `AGENTS.md` | Arbeitsregeln für Menschen und Agenten |
| `ARCHITECTURE.md` | Architektur, Stores, Provider, übernommene und verworfene OstRecht-Konzepte |
| `CONTENT.md` | Dateiformate und Pflegewege unter `content/` |
| `docs/LEGAL_SCOPE.md` | Welche Vorschriften zum Landesrechtsbestand gehören (alle Länder) |
| `docs/DATA_MODEL.md` | Normdatenmodell, Body-Blöcke, Zeitmodell, D1-Schema |
| `docs/OSTRECHT_COMPATIBILITY.md` | Adapter und Abgrenzung zu OstRecht |
| `docs/FEDERAL_COMPATIBILITY.md` | Bundesrechtsresolver und Rechtsverweise |
| `docs/IMPORT_ARCHITECTURE.md` | Importpipeline und geplante Importer |
| `docs/RECHT_NRW_IMPORT.md` | RECHT.NRW-Struktur, gehärteter Importpfad (Stichtagsauswahl, Organe, Erkennung, Fundstellen), Manifest, Bedienung |
| `docs/RECHT_NRW_LRMB_IMPORT.md` | Verwaltungsvorschriften (LRMB): Befund, Zeitmodell, Rekonstruktion, Parser, Beispielkorpus |
| `docs/RECHT_NRW_BULK_IMPORT.md` | Vollständiger Ausgangsimport: Enumeration, Bulk-Runner, Checkpoints, Budgets, Cache, R2, Phasen und Audit |
| `docs/RECHT_NRW_BULK_READINESS.md` | Bereitschaft: Policies (undatierte LRMB-Datensätze, PDF), GO/No-Go-Checkliste, Befehle und Reihenfolge des Bulk-Laufs |
| `docs/WEST_REFERENCE_BASELINE.md` | Eingefrorener West-Referenzstand: Kennzahlen, Auditstände, Human Approval, Freeze-Regeln |
| `docs/BAYWUE_BASELINE_FREEZE.md` | Eingefrorener BayWü-Ausgangsrechtsstand: Freeze-Commit, Fingerabdruck, 539 ausgeschlossene Fälle, StRGVV, Freeze-Regeln (Freigabe: `docs/BAYWUE_BASELINE_HUMAN_APPROVAL.md`) |
| `docs/NSH_BASELINE_FREEZE.md` | Eingefrorener NSH-Ausgangsrechtsstand: Freeze-Commit, Fingerabdruck, Restfälle, Freeze-Regeln (Freigabe: `docs/NSH_BASELINE_HUMAN_APPROVAL.md`) |
| `docs/NEW_JURISDICTION_IMPORT_CHECKLIST.md` | Wiederverwendbare Checkliste für den Import einer weiteren Jurisdiktion |
| `docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md` | Zugriffspolitik juris SH (robots.txt advisory), öffentlicher PDF-Ausgabeweg ohne interne Schnittstelle, TDM-Vorbehalt |
| `docs/SCHLESWIG_HOLSTEIN_SOURCE_DISCOVERY.md` | juris SH: Dokumentmodell, Identität, Fassungen, Enumerationspfade (Befund, nicht Bauplan) |
| `docs/SCHLESWIG_HOLSTEIN_PUBLICATION_DISCOVERY.md` | GVOBl./Amtsbl. Schl.-H.: Adressschemata, Formatwechsel 2024/2025, PDF-Befunde |
| `docs/SCHLESWIG_HOLSTEIN_TRANSFORMATION.md` | Überleitung Schleswig-Holstein → Niedersachsen-Holstein: Regelwerk, Schutzmuster, fail-closed-Prüfung |
| `docs/SCHLESWIG_HOLSTEIN_EVENT_LEDGER.md` | Ereignisregister nach dem Stichtag aus den amtlichen Registern und Verkündungsblättern |
| `docs/SCHLESWIG_HOLSTEIN_BULK_READINESS.md` | Bereitschaft des NSH-Ausgangsimports: READY (lokal), offene Entscheidungen (TDM-Vorbehalt, Landeskürzel), GO/No-Go |
| `docs/BAYERN_SOURCE_DISCOVERY.md` | BAYERN.RECHT: XML-Export (zwei DTDs), Enumeration, fehlende Fassungshistorie, Lizenz, Verkündungsorgane |
| `docs/BAYERN_PARSER.md` | BayWü-Parser: Abdeckung beider DTDs, Annahmen, Abbruchbedingungen, Befundcodes |
| `docs/BAYERN_TRANSFORMATION.md` | Überleitung Bayern → Bayern-Württemberg: konstruierte Idempotenz, Adjektiv- und Abkürzungsentscheidung |
| `docs/BAYWUE_HISTORICAL_BASELINE.md` | Wie der Stichtagsbestand 2023-12-01 entsteht: Klassen, Wiederherstellungswege, Provenienzrang |
| `docs/BAYWUE_BASELINE_STATUS.md` | Stand des BayWü-Stichtagsbestands: was übernommen ist, was fehlt und warum |
| `docs/BAYWUE_SOURCE_MODEL.md` | Quellenmodell: amtlich, nachrichtlich, nichtamtlich – und wo das im Datenmodell steht |
| `docs/BAYERN_BULK_READINESS.md` | Bereitschaft des BayWü-Ausgangsimports (historisch; READY, Bulk ausgeführt), GO/No-Go |
| `docs/SEARCH.md` | Suchplan (and-first), Golden Set, Fast-/Full-Audit |
| `docs/DEPLOYMENT.md` | Lokale Prüf- und Deployschritte (keine CI), Cloudflare-Ressourcen, D1-Projektion, Variablen |
| `docs/RELEASE_READINESS.md` | Release-Status (`npm run release:check`): Baselines, Sim-Status, Tests, Suche, API, D1/R2, Ost, bekannte Einschränkungen |
| `docs/MAINTENANCE.md` | Laufender Betrieb: Source-Inbox und Intake, Queue-Lebenszyklus, Baseline-Evidenz, lokaler Dev-Betrieb |
| `docs/SIMULATION_IMPORT.md` | Sim-Rechtsfortschreibung: Evidenz, Ledger, Rezepte, Gates, Freeze-Semantik, Vollständigkeit |
| `docs/SIM_SOURCE_ACQUISITION.md` | Noch zu beschaffende Sim-Quellen (erzeugt; Kurzliste `npm run sources:needed`) |

## Stand der Quelladapter

| Land | Quelle | Stand |
| --- | --- | --- |
| West | RECHT.NRW | **Baseline FROZEN** – 1 482 Normen zum Stichtag, Human Approval abgeschlossen (`docs/WEST_REFERENCE_BASELINE.md`) |
| NSH | juris Schleswig-Holstein | **Baseline FROZEN** – 2 672 Normen zum Stichtag (Freeze-Commit `eeeca2cd…`, `docs/NSH_BASELINE_FREEZE.md`); nicht sicher belegte Stichtagsfassungen bleiben ausgeschlossen und werden in der Oberfläche als Teilbestand gekennzeichnet |
| Ost | OstRecht | **read-only upstream** – Laufzeit aus der OstRecht-D1 `ostrecht-recht`; Volltextindex nur für die geltende Fassung |
| BayWü | BAYERN.RECHT | **Baseline FROZEN** – 1 618 Normen zum Stichtag (Freeze-Commit `018752ab…`, `docs/BAYWUE_BASELINE_FREEZE.md`); nicht sicher belegte Stichtagsfassungen bleiben ausgeschlossen (`docs/BAYWUE_BASELINE_STATUS.md`) |

Sim-Quellenstatus West, NSH und BayWü: bewusst `PARTIAL` (bekannte Quellenlücken, `docs/SIM_SOURCE_ACQUISITION.md`);
das ist keine Einschränkung des eingefrorenen Ausgangsrechtsstands.

Der NSH-Bestand entsteht ausschließlich über öffentliche Ausgabewege des Portals; die interne
Sitzungs-/CSRF-Schnittstelle wird nicht benutzt.
