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
- **D1 ist eine abgeleitete Laufzeitprojektion**, je Jurisdiktion eine Datenbank
  (`landesrecht-west`, `-nsh`, `-ost`, `-baywue`), deterministisch aus Git erzeugt.
- **R2 ist das unveränderliche Quellenarchiv** für amtliche Rohquellen (`landesrecht-quellen`).
- **Zwei Zeitachsen je Fassung**: `simulationValidFrom/To` (Geltung in der Simulation) und
  `sourceValidFrom/To` (Geltung der übernommenen realen Quellfassung).
- **OstRecht bleibt Source of Truth für Ost**; dieses Repository übernimmt ostdeutsche Normen nur
  über die Provider-/Importschnittstelle und pflegt sie nicht selbst.
- **Bundesrecht bleibt extern** (`gesetze-sim-internet.de`); der FederalProvider bildet Links an
  genau einer Stelle.
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
packages/importers/       Pipeline-Schnittstellen (common), RECHT.NRW-Importer (recht-nrw), Platzhalter je weiterem Quellportal
content/norms/<jur>/      kanonische Normen (synthetische Testfixtures; west: 12 LRGV- und 8 LRMB-Stichtagsfassungen aus RECHT.NRW)
content/publications/     Verkündungsblatt-Ausgaben je Jurisdiktion
data/d1/                  D1-Migrationen (Schema)
data/runtime/             lokale SQLite-Projektionen / SQL-Pläne (generiert, nicht eingecheckt)
data/audits/              Importberichte (recht-nrw/<slug>.json: Erkennungen, Transformation, Integrität; recht-nrw/lrmb/: Belege nicht übernommener LRMB-Dokumente; coverage.json)
data/imports/             gemeinsames Importmanifest, Review-Queue, Korpora und Rekonstruktionsrezepte des RECHT.NRW-Imports
sources/recht-nrw/        archivierte Rohquellen der RECHT.NRW-Beispielkorpora LRGV und LRMB (versioniert, SHA-256 im Manifest)
scripts/                  Validierung, Projektion, Schemaprüfung, Unveränderlichkeitsprüfung
tests/                    Vitest (synthetische Fixtures, lokale SQLite-D1, OstRecht-Kompatibilität)
docs/                     Datenmodell, OstRecht-/Bundesrechts-Kompatibilität, Import, Deployment
```

## Entwicklung

```sh
npm ci
npm run dev              # seedet die lokale Miniflare-D1 aus content/ und startet den Astro-Dev-Server
npm run d1:seed:dev      # nur der Seed der lokalen Miniflare-D1 (apps/web/.wrangler/state)
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
npm run import:recht-nrw:review                   # RECHT.NRW: offene Review-Fälle
npm run import:recht-nrw:coverage [-- --write]    # RECHT.NRW: Coverage-Report
npm run import:recht-nrw:audit                    # RECHT.NRW: Manifest, Rohquellen, Reports, Rekonstruktionen prüfen
```

Der Worker liest ausschließlich D1. Auch `astro dev` führt die Worker-Routen in workerd aus und
liest die lokale Miniflare-D1, die `npm run d1:seed:dev` deterministisch aus `content/` befüllt.
Nur außerhalb eines Workers (Prerendering im Node-Build, Skripte, Tests) fällt der Datenzugriff auf
den Dateistore über `content/` zurück (`apps/web/src/lib/runtime/context.ts`).

## Adressen

```text
/                                   Startseite mit gemeinsamer Suche und vier Länderzugängen
/<land>/                            Länderseite mit Testnormen
/<land>/norm/<slug>/                geltende Fassung
/<land>/norm/<slug>/version/<yyyy-mm-dd>/   unveränderliche Fassung
/<land>/norm/<slug>/{daten,historie,vergleich,quellen}/
/suche/                             Suche über alle oder einzelne Länder
/.well-known/simrecht.json          SimRecht-Deklaration
/api/v1/jurisdictions, /api/v1/norms/{jurisdiction}/{slug}[/versions], /api/v1/search
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
| `docs/RECHT_NRW_BULK_IMPORT.md` | Plan für den vollständigen Ausgangsimport (Phase A LRGV, Phase B LRMB, gemeinsames Audit) |
| `docs/DEPLOYMENT.md` | GitLab-CI, Cloudflare-Ressourcen, D1-Projektion, Variablen |
