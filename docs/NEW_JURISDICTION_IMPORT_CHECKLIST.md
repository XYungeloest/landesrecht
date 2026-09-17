# Checkliste: Import einer weiteren Jurisdiktion (NSH, BayWü)

Wiederverwendbare Arbeitsliste für den Ausgangsimport eines weiteren Landes nach dem Muster des
RECHT.NRW-Imports (West). Jeder Punkt nennt das Ergebnis, das vor dem nächsten Schritt vorliegen muss, und die
Komponente, die dafür bereits existiert (Übersicht in `ARCHITECTURE.md`, „Wiederverwendbare
Importkomponenten“). Verbindliche Regeln für alle Importer: `docs/IMPORT_ARCHITECTURE.md`; Umfang:
`docs/LEGAL_SCOPE.md`. Ost bleibt lesend (OstRecht ist externe Source of Truth).

| # | Schritt | Ergebnis / Nachweis | Wiederverwendbar | Neu je Jurisdiktion |
| --- | --- | --- | --- | --- |
| 1 | **Quellportal** erkunden: Bereiche (Gesetze/Verordnungen, Verwaltungsvorschriften, Verkündungsblatt), Adressschema, Fassungslisten, Robots/Nutzungsbedingungen, Ratenverhalten | Kurzdossier in `docs/<PORTAL>_IMPORT.md`: Adressmuster, Fassungsmodell, Sperrverhalten; Beleg, dass kein Zugriffsschutz umgangen wird | Fetcher-Policy (`common/fetcher.ts`: Mindestabstand, Retry-After, Sperrabbruch, Budgets, Cache) | Adressparser (`source-identity.ts`-Pendant), Bereichsdefinition |
| 2 | **Scope** festlegen: welche Dokumenttypen werden Landesrecht der Simulation, welche nicht (Normativitätsfilter) | Abschnitt in `docs/LEGAL_SCOPE.md`; Klassifikationstabelle Portaltyp → Normtyp | Normtypen und Vokabular (`legal-core`), Normativitätsprüfung als Muster (`lrmb/classify.ts`) | Portaltyp-Zuordnung, Normativitätsregeln des Landes |
| 3 | **Stichtag**: `SIMULATION_BASELINE_DATE` gilt für alle Länder; Zeitmodell unverändert | `jurisdictions.ts` (Register: Quellportal, Verkündungsblatt); keine eigene Stichtagslogik | `SIMULATION_BASELINE_DATE`, Zeitmodell (`versions.ts`), `assertBaselineConsistency` | – |
| 4 | **Enumeration**: vollständige Liste der Stammnormen aus mindestens zwei unabhängigen Quellen (z. B. Sitemap + Suchindex) mit Abgleich | `data/imports/<system>/enumeration-<bereich>.json`, Abgleich `ok`, Invariantenprüfung grün | Enumerationsdatei, Statusmodell `pending → processing → done/review/failed/excluded`, Abgleich, Invarianten (`common/enumeration.ts`) | Quellenabruf je Portal (Sitemap-/Index-Parser), Vorklassifikation |
| 5 | **Versionierung / Stichtagsauswahl**: Fassungsliste je Stammnorm, Auswahl der am Stichtag geltenden Fassung, lokal fail-closed | Testfälle: eindeutig, Lücke, Überlappung, undatiert; Befund „unklar“ blockiert | `selectSourceVersionAtBaseline` (`common/version-selection.ts`), Geltungsstatus/Provenienz im Schema | Fassungslisten-Parser, portalspezifische Datumsformate |
| 6 | **Raw archive**: unveränderte Rohquellen mit SHA-256; Beispielkorpus versioniert (`sources/<system>/`), Bulk nur R2 mit Staging außerhalb von Git | Objektschlüssel `<jur>/<system>/<stichtag>/…`, Umschlag je Objekt, Rücklesung; Bulkmodus bricht bei Git-Pfaden ab | `common/archive.ts` (versioned-sample, r2, Staging, `uploadVerified`, Sync mit readback/etag), `common/r2-transport.ts` (wrangler Standard, s3, wrangler-api) | Präfix `<jur>/<system>` (bereits parametrisiert über `TARGET_JURISDICTION`/`SOURCE_SYSTEM` – je Importer als Konstante) |
| 7 | **Parser**: Quellformat → `SourceLaw` (Recht des Herkunftslandes, nichts transformiert), Dokumentidentität und Körperplausibilität | Beispielkorpus mit ≥ 10 Vorschriften, Integritätsprüfung fetch→parse, `document-sanity` `consistent` | Body-Blockmodell und Validierung (`legal-core/schema.ts`), Parserbausteine (`common/html.ts`, `body-common.ts`, `pdf.ts`, `document-sanity.ts`, `integrity.ts`) als Muster | HTML-/PDF-Parser des Portals, Fußnoten-, Tabellen-, Anlagenlogik |
| 8 | **Validity**: Geltung am Stichtag nur aus Belegen (Intervall `exact`, `verified-active-at-baseline`, `reconstructed`, sonst `undetermined` → Review) | Policy-Abschnitt (Muster: `docs/RECHT_NRW_BULK_READINESS.md`, „Undatierte Altdatensätze“), Tests | Provenienzfelder `sourceStatus`, Review-Kategorien, Rekonstruktion nur mit Rezept (`lrmb/reconstruction.ts` als Muster) | Belegquellen des Landes (Amtsblatt, Änderungsvermerke), Kontinuitätsregeln |
| 9 | **Transformation**: Erkennung landesbezogener Bezeichnungen → Entscheidung → Ersetzung → Prüfung nach Transformation (fail-closed); Erlassorgan nur aus ausdrücklicher Formel | Report je Norm mit Änderungen, Erkennungen, offenen Entscheidungen; keine Fundstellen/URLs/Hashes transformiert | Reportformat, Post-Transform-Audit, Institutionen-Zuordnung als Datei (`institution-mapping.json`), Overrides (`common/overrides.ts`) | Regelwerk des Landes (`transform/rules.ts`-Pendant), Institutionenregister, Abkürzungsregeln |
| 10 | **Sample corpus**: kuratierter Validierungskorpus mit Erwartungen (Status, Geltung, Textstand) | `sample --area … --offline` grün, Rohquellen unter `sources/<system>/` | Korpusdatei-Format und `sample`-Befehl | Auswahl der Fälle (Regelfall, PDF, undatiert, Staatsvertrag, Anlage fehlt, …) |
| 11 | **Coverage**: Manifest ↔ Inhalte ↔ Slug-Registry ↔ Enumeration konsistent; Review-Fälle messbar | `coverage --write`, `audit` ohne Abweichung | `common/coverage.ts`, `common/manifest.ts`, `common/slug-registry.ts`, `audit`-Befehl | Bereichsnamen, Kennzahlen je Portaltyp |
| 12 | **Review**: Review-Queue je Quelle mit Kategorien, Entscheidungen mit Begründung, Overrides mit Beleg | `review`-Befehl, Shards unter `data/imports/<system>/review/` | `common/review-queue.ts`, `review-*`-Werkzeuge, Entscheidungsformat | Kategorien, die nur dieses Portal braucht (sparsam) |
| 13 | **Bulk**: Dry-run → Stichprobe mit `--write --limit` → vollständig mit `--resume`; Budgets, Checkpoints, systemische Abbrüche | Laufzusammenfassungen unter `data/audits/<system>/runs/`, Logzeilen mit Lauf-ID/Bereich/Schlüssel/Phase/Ergebnis/Dauer | `common/bulk-runner.ts` (Auswahl, Checkpoints, Resume, Dublettenzusammenführung, systemische Limits), Stop-Controller, Readiness (`common/readiness.ts`) | `ItemProcessor` des Importers (Importpfad je Bereich) |
| 14 | **D1**: Projektion voll und inkrementell, Batches mit Basisprüfung, lokal geprüft vor Remote | `d1:plan`, `d1:apply:batches --local`, Skalierungsnachweis | `packages/runtime` (Projektion, `incremental.ts`, `sql-batches.ts`, Registry), eine Datenbank je Jurisdiktion (`bindings.ts`) | Datenbank `landesrecht-<jur>` anlegen, `database_id` in `wrangler.jsonc` |
| 15 | **R2**: Upload der gestagten Rohquellen mit Prüfung (`r2-sync`), Unveränderlichkeit | Manifeststatus `verified`, Sync-Protokoll | `r2-sync` (Transporte, readback/etag), gemeinsamer Bucket `landesrecht-quellen` | Nur das Präfix `<jur>/<system>/` |
| 16 | **Search**: Sucheinheiten aus dem Normkörper, Suchintegrität je Jurisdiktion | `search-audit --jurisdiction <jur>` grün, Golden-Set | `packages/search`, `common/search-audit.ts` | Golden-Anfragen des Landes |
| 17 | **Deployment**: Worker mit allen Bindings, Healthcheck `/health` 200, Konfigurationsfehler-Modus geprüft, Smoke gegen `/api/v1/jurisdictions` | `docs/DEPLOYMENT.md`, Redeploy nach Änderungen an `apps/web` | Worker, Middleware, Healthcheck, API | `SITE_URL`/Routes, Staging-Ressourcen mit Suffix |

## Reihenfolge und Freigaben

1. Schritte 1–3 sind Dokumentation und Entscheidung (keine Abrufe außer Stichproben).
2. Schritte 4–12 laufen lokal und offline-wiederholbar; jeder Schritt hat Tests und einen Beispielkorpus.
3. Schritt 13 erst nach `readiness` = READY und GO/No-Go-Checkliste (Muster `docs/RECHT_NRW_BULK_READINESS.md`).
4. Schritte 14–17 (Remote-D1, R2-Upload, Deployment) nur mit gesonderter Freigabe; nie aus einem Bulk-Lauf heraus.

## Was nicht vorschnell abstrahiert wird

Code wird erst dann in `packages/importers/common` gehoben, wenn (a) die Semantik identisch ist, (b) mindestens zwei
Importer sie brauchen und (c) die Abstraktion den Code vereinfacht. Bis dahin gilt: Muster kopieren, Portal-
spezifisches klar benennen (`docs/IMPORT_ARCHITECTURE.md`). Die Tabelle in `ARCHITECTURE.md` hält fest, was heute
bereits jurisdiktionsneutral ist und was NRW-spezifisch bleibt.
