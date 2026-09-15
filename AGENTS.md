# AGENTS.md

## Grundregel

Dieses Repository ist das gemeinsame Landesrechtsportal der vier Länder der politischen
Simulation (West, NSH, Ost, BayWü). Es ist eigenständig; das Schwesterprojekt `../staatsregierung`
(OstRecht) wird nur gelesen und analysiert, nie verändert.

Prioritäten:

1. Fachliche Korrektheit des Normbestands: Git ist Source of Truth, D1 nur Projektion, R2 nur Archiv.
2. Keine verstreuten Länderbezeichnungen oder Stichtage – alles kommt aus
   `packages/legal-core/src/config/jurisdictions.ts` und `editorial.json`.
3. Bewährte OstRecht-Konzepte übernehmen, Sachsen-/REVOSax-Spezifika nicht in den generischen Kern.
4. Änderungen klein, überprüfbar, ohne neue Frameworks.

## Verbindliche Regeln

- Ausgangsrechtsstand aller Länder: `SIMULATION_BASELINE_DATE` (2023-12-01). Der redaktionelle
  Stichtag (`EDITORIAL_REFERENCE_DATE`) liegt nie davor und wird nur vorwärts fortgeschrieben.
- Jede Fassung trägt `simulationValidFrom/simulationValidTo` (Geltung im Portal) und optional
  `sourceValidFrom/sourceValidTo` (Geltung der realen Quellfassung). `validFrom/validTo` ohne
  Präfix ist im Schema ausdrücklich verboten.
- Gespeicherte Fassungen sind unveränderlich: neue Rechtslage = neue Datei unter `versions/`.
  `npm run content:immutability` prüft das gegen HEAD; Ausnahmen nur mit `--allow`.
- Externe Kennungen sind generisch (`externalIdentifiers: [{ system, value }]`); keine Spalten
  oder Felder wie `revosax_law_id`.
- Rechtsverweise sind strukturierte Daten (`LegalReference`), nie rohe URLs im Normtext. Der
  Resolver in `packages/providers/src/resolver.ts` entscheidet über das Ziel.
- URL-Bildung nur über `packages/legal-core/src/lib/routes.ts`; Bundesrechts-URLs nur über
  `packages/providers/src/federal.ts`.
- Ostdeutsche Normen werden hier nicht redaktionell gepflegt; sie kommen über den
  OstRecht-Adapter (`packages/providers/src/ostrecht.ts`, `packages/importers/ostrecht`).
- Keine Massenimporte, kein Scraping, keine Cloudflare-Ressourcen, keine Secrets im Repository.
- RECHT.NRW-Import nur über die CLI (`npm run import:recht-nrw …`), Dry-run ist Standard; importierte
  Normen unter `content/norms/west/` werden nicht von Hand bearbeitet (`docs/RECHT_NRW_IMPORT.md`).
  Verwaltungsvorschriften (LRMB) werden mit diesem Importer nicht übernommen.
- Öffentliche Texte auf Deutsch mit echten Umlauten; der Simulationshinweis bleibt sichtbar
  (Hinweisleiste, Startseite, Fußzeile, Impressum).

## Arbeitsweise

- Vor Architekturentscheidungen den tatsächlichen Repo-Zustand und `ARCHITECTURE.md` lesen.
- Neue zentrale Regeln knapp hier oder im passenden Dokument unter `docs/` dokumentieren; keine
  Chroniken oder Statusberichte in Markdown.
- Vor Abschluss ausführen: `npm run check`, `npm run test`, `npm run content:check`,
  `npm run d1:schema:check`, `npm run build`.

## Technik

- Astro 7 mit Cloudflare-Adapter, `output: 'static'`; D1-lesende Routen setzen `prerender = false`.
- Worker-Bindings: `LANDESRECHT_WEST|NSH|OST|BAYWUE` (D1), `LANDESRECHT_QUELLEN` (R2), definiert in
  `packages/runtime/src/bindings.ts`, verwendet in `apps/web/wrangler.jsonc`.
- Der Worker importiert nie `node:fs`; Dateiloader werden nur außerhalb des Workers dynamisch geladen.
- TypeScript wird von Node direkt ausgeführt (Type-Stripping): keine Parameter-Properties, keine
  Enums, keine Namespaces; `.ts`-Endungen in Importen.
- Tests: Vitest unter `tests/unit/`, synthetischer Bestand in `tests/helpers/fixture-corpus.ts`,
  lokale D1-Tests über den SQLite-Adapter (`node:sqlite`, FTS5).

## Bei Unsicherheit

`ARCHITECTURE.md`, `docs/DATA_MODEL.md` und den OstRecht-Code unter `../staatsregierung`
heranziehen. Wenn mehrere Wege möglich sind: der einfache, robuste, bereits in OstRecht
bewährte Weg, sofern er sich sauber verallgemeinern lässt.
