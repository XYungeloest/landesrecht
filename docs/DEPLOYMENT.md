# Deployment

Stand: Der Worker `landesrecht` läuft unter workers.dev und der eigenen Domain `landesrecht-online.de` (Custom Domain,
in `wrangler.jsonc` unter `routes` eingetragen – ein Deploy mit leerer Liste löst sie vom Worker; öffentlich erreichbar,
sobald die Nameserver der Domain auf Cloudflare zeigen), zuletzt deployt 2026-09-19 als Version
`3d606854-f9c2-4eee-a2ff-38cb70118ef4` (West: D1 `landesrecht-west` mit 1 482 Normen; BayWü: D1
`landesrecht-baywue` mit 1 700 Normen; NSH: D1 `landesrecht-nsh` mit 2 450 Normen – Schema 2026-09-19 angelegt,
63 Batches voll, danach 6 inkrementell eingespielt, Zielfingerabdruck `6cf5aa27` nachgeprüft, lokal ↔ remote
identisch; R2 `landesrecht-quellen` privat mit den Rohquellen aller drei Länder, `nsh/` 17 024 Objekte). NSH-Release nach
Nutzerfreigabe (Nutzungsfreigabe von juris laut Nutzer, `data/imports/juris-sh/source-rights-approval.json`).
Der NSH-R2-Sync prüft mit `--verify etag` über ein Listing (Größe + MD5) statt je Objekt zurückzulesen; der
Wrangler-API-Transport verwendet ein noch gültiges OAuth-Token bis zum echten Ablauf weiter (`wrangler whoami`
erneuert erst danach). Alle Remote-Schritte (Deploy, Remote-D1, R2-Upload) bleiben
manuelle, einzeln freigegebene Schritte; Wrangler-Anmeldung nur per OAuth (`npx wrangler login`).

## Keine CI-Pipeline

Die GitLab-CI (`.gitlab-ci.yml`) ist seit 2026-09-19 entfernt: Sie lief seit vielen Commits nicht grün, hat nie
deployt und verbrauchte nur CI-Minuten. Prüfen und Ausliefern geschieht lokal und einzeln freigegeben:
`npm run check`, `npm run content:check`, `npm run d1:schema:check`, `npm run test`, `npm run build`,
`npm run deploy` – Cloudflare nur über die Wrangler-OAuth-Anmeldung (`npx wrangler login`), ohne API-Token.
Es werden weder GitHub-Actions- noch GitLab-CI-Workflows verwendet.

Optional: `SITE_URL` (öffentliche Origin für Canonical-Links; Standard in `astro.config.mjs`).
Keine Secrets im Repository (`.env` ist ignoriert, `.env.example` dokumentiert die Namen).

## Cloudflare-Ressourcen (manuell anlegen)

```sh
npx wrangler d1 create landesrecht-west
npx wrangler d1 create landesrecht-nsh
npx wrangler d1 create landesrecht-baywue
npx wrangler r2 bucket create landesrecht-quellen
# Staging analog mit Suffix -staging; Ost braucht keine eigene Datenbank (OstRecht-D1, siehe unten)
```

Die zurückgegebenen `database_id`-Werte ersetzen die Platzhalter in `apps/web/wrangler.jsonc`
(Muster `00000000-0000-4000-8000-0000000000NN`). Bindings: `LANDESRECHT_WEST|NSH|BAYWUE`,
`OSTRECHT_RECHT`, `LANDESRECHT_QUELLEN` (`packages/runtime/src/bindings.ts`, `WORKER_D1_BINDINGS`). Die Worker-Environments erben
Bindings nicht; `env.staging` deklariert eigene Datenbanken und einen eigenen Bucket
(`tests/unit/content-and-config.test.ts` prüft das).

### Ost: OstRecht-D1 als einzige Laufzeitquelle (`OSTRECHT_RECHT`)

Datenfluss: `OstRecht Git/Importer → D1 ostrecht-recht (Sync von OstRecht) → Landesrecht Runtime-Adapter
(packages/runtime/src/ostrecht-d1-store.ts) → Landesrecht Web/API`. Das Binding `OSTRECHT_RECHT` zeigt auf die
bestehende OstRecht-Datenbank `ostrecht-recht` (Produktion `2491f200-de20-4a45-b028-d00a4fd57840`, Staging
`ostrecht-recht-staging` `ba9c0e0b-ba18-4aec-b28e-fe65c8b69674`) desselben Cloudflare-Kontos; es wurde keine neue
Ressource angelegt. Regeln:

- Nur lesen: der Worker spricht das Binding ausschließlich über `createReadOnlyD1` an (einzelne SELECT/WITH-
  Anweisungen; `INSERT/UPDATE/DELETE/CREATE/…`, Batches und Migrationen sind unerreichbar). Landesrecht spielt gegen
  `ostrecht-recht` nie Migrationen ein, projiziert nichts hinein und synchronisiert kein Ost-R2.
- Es gibt kein Binding `LANDESRECHT_OST`. Die frühere leere Datenbank `landesrecht-ost`
  (`fae13440-7670-4f50-b14e-d4aeafad40b9`) war am 2026-09-28 (≈ 20:00 UTC) im Konto nicht mehr vorhanden
  (`wrangler d1 list`/`d1 info`: not found; die Wrangler-Logs dieses Projekts enthalten keinen Löschaufruf) und
  ließ den bis dahin deployten Worker mit `/health` 503 antworten. Sie wird nicht neu angelegt: Ost hat keine
  eigene Landesrecht-Datenbank, die Registry liest ausschließlich `OSTRECHT_RECHT`
  (`tests/unit/ostrecht-contract.test.ts`, `tests/unit/content-and-config.test.ts`).
- Fail closed: vor dem ersten Zugriff prüft der Adapter den Schema-Contract (`ostrecht-contract.ts`: Tabellen und
  Spalten, JSON-Grundstruktur, FTS5, `law_runtime_meta` mit `sync_state = complete`, Fingerabdruck, `corpus_hash`).
  Bei Abweichung oder laufendem OstRecht-Sync antworten Ost-Seiten und -API mit dem Konfigurationsfehler (HTTP 500),
  nie mit halbgültigen Daten; die Prüfung wird je Binding fünf Minuten zwischengespeichert (Fehlschlag: 15 s).
- Stichtage: OstRecht führt einen eigenen redaktionellen Stichtag. Landesrecht leitet geltend/historisch/künftig
  beim Lesen aus Intervall und eigenem Stichtag ab; OstRecht indexiert Sucheinheiten nur für die an seinem Stichtag
  geltende Fassung (frühere Fassungen sind über Fassungsseiten erreichbar, aber nicht volltextsuchbar). Liegt der
  Landesrecht-Stichtag hinter einer künftigen OstRecht-Fassung, bevor OstRecht neu synchronisiert, fehlt dieser
  Fassung der Suchindex – das Drift-Audit meldet es (`currentVersionsWithoutUnits`).
- Diagnose: `/api/v1/jurisdictions` liefert für Ost `runtimeSource: ostrecht-d1` und `runtime` (Sync-Zustand,
  Sync-Zeitpunkt, `upstreamCorpusHash`, `projectionFingerprint`); `/health` prüft für `OSTRECHT_RECHT` zusätzlich
  `sync_state = complete` (`incomplete` → 503).
- Drift-/Freshness-Audit: `npm run audit:ost-drift` (Remote über die Wrangler-Anmeldung, nur Leseanweisungen),
  `-- --sqlite <seed.sqlite|fixture.sql>` lokal, `-- --ostrecht-root ../staatsregierung` zusätzlich Stichprobe
  D1 ↔ OstRecht-Git (nur lesen), `--write` schreibt den Bericht nach `data/audits/ostrecht/`. Geprüft werden
  Contract, `sync_state`, Identität, Zähler, Store-Stichprobe, Suchparität und Verkündungen.
- Lokal ohne Worker: `OSTRECHT_D1_SQLITE=<seed.sqlite> npm run dev` liest Ost aus einem lokal erzeugten OstRecht-
  Seed (`node scripts/d1-runtime-seed.mjs build --out …` im OstRecht-Repository, nur lesend); ohne die Variable
  bleibt Ost lokal leer. Die Test-Fixture `tests/fixtures/ostrecht/ostrecht-recht.sql` (Auszug, kein Bestand) wird
  mit `npm run fixture:ostrecht -- --seed <seed.sqlite>` erzeugt.

## D1-Schema und Projektion

```sh
npx wrangler d1 migrations apply landesrecht-west --remote   # data/d1/*.sql, je Datenbank
npm run d1:apply:remote                                       # schreibt data/runtime/landesrecht-<jur>.sql
npx wrangler d1 execute landesrecht-west --remote --file data/runtime/landesrecht-west.sql
```

Die Projektion ist deterministisch (`projection_fingerprint` in `law_runtime_meta`); sie läuft
nie automatisch gegen eine produktive Datenbank. Lokale Prüfung: `npm run d1:seed:local`,
`npm run d1:schema:check`. Reihenfolge bei Änderungen: lokal → Staging → Produktion.

### Migration 0002: Verkündungen (`law_publications`)

`data/d1/0002_publications.sql` ergänzt die Tabelle `law_publications` (Verkündungsblatt-Ausgaben der Simulation aus
`content/publications/<land>/`, Vorbild OstRecht) **additiv**: `CREATE TABLE IF NOT EXISTS`, keine Änderung an den
Normtabellen. Die drei produktiven Datenbanken tragen Schema 0001 und erhalten die Tabelle einzeln, aus `apps/web`:

```sh
npx wrangler d1 execute landesrecht-west   --remote --config wrangler.jsonc --file ../../data/d1/0002_publications.sql --yes
npx wrangler d1 execute landesrecht-nsh    --remote --config wrangler.jsonc --file ../../data/d1/0002_publications.sql --yes
npx wrangler d1 execute landesrecht-baywue --remote --config wrangler.jsonc --file ../../data/d1/0002_publications.sql --yes
```

- Reihenfolge: Migration zuerst, dann `npm run d1:plan -- --jurisdiction <land> --incremental` und `d1:apply:batches`.
  Ein Plan, der Verkündungen schreibt oder eine Vollprojektion ist (`DELETE FROM law_publications` im Reset), scheitert
  auf einer Datenbank ohne die Tabelle mit `no such table: law_publications`, bevor Normen berührt werden.
- Der Fingerabdruck eines Bestands **ohne** Verkündungen ändert sich durch die Tabelle nicht: Verkündungen fließen erst
  in `projection_fingerprint` und in den Projektionszustand (`state.json`, Feld `publications`) ein, wenn ein Land
  welche führt. West bleibt gegenüber `data/runtime/projection-state-west.remote.json` „noop“; ein Remote-Zustand ohne
  das Feld `publications` gilt als „keine Verkündungen projiziert“.
- Der Worker liest die Tabelle fehlertolerant (`listPublications`/`getPublication` liefern ohne Tabelle leere
  Ergebnisse); `npm run audit:d1-remote` zählt `law_publications` lokal ↔ remote und meldet eine fehlende Tabelle als
  Befund statt abzubrechen.
- Verkündungen werden inkrementell wie Normen behandelt: neue, geänderte und entfernte Ausgaben erzeugen eigene
  Plangruppen (`(verkündung) <slug>`, `(verkündung entfernt) <slug>`); die Web-Routen `/<land>/verkuendungen/…` und
  `/api/v1/publications/<land>…` lesen ausschließlich `law_publications`.

`d1:apply:remote` schreibt eine einzige SQL-Datei und ist nur für kleine Bestände gedacht. Für mehrere
Tausend Normen (West nach dem Bulkimport) gilt der Batch-Weg:

```sh
npm run d1:plan -- --jurisdiction west                                  # data/runtime/d1-batches/landesrecht-west/NNNN.sql + plan.json + state.json
npm run d1:apply:batches -- --database landesrecht-west                  # Dry-run: SHA-256, Reihenfolge, offene Dateien
npm run d1:apply:batches -- --database landesrecht-west --local --execute  # lokale Miniflare-D1
npm run d1:apply:batches -- --database landesrecht-west --execute --confirm-remote landesrecht-west [--resume]
```

- Voraussetzung: Die Batches setzen das Schema voraus. Eine leere Datenbank zuerst mit
  `npx wrangler d1 execute landesrecht-west --remote --config wrangler.jsonc --file ../../data/d1/0001_landesrecht.sql --yes`
  (aus `apps/web`; lokal mit `--local`) anlegen, sonst scheitert die erste Datei mit `no such table: law_search`.
- Aufteilung: höchstens 1 500 Anweisungen und 6 MB je Datei, einzelne Anweisungen höchstens 100 KB
  (`packages/runtime/src/sql-batches.ts`); je Norm Löschen und Neuaufbau in derselben Datei, damit ein
  abgebrochener Lauf mit `--resume` fortgesetzt werden kann. Protokolle je Ziel getrennt: `apply-state.json`
  (remote) und `apply-state.local.json` (lokal) – ein lokal eingespielter Plan gilt remote nicht als eingespielt.
- Nachprüfung am Ziel (seit 2026-09-18): Nach der letzten Datei liest `d1-apply-batches` `projection_fingerprint` und
  `projection_state` aus der Zieldatenbank; übernommen wird der Projektionszustand nur, wenn der Zielfingerabdruck des
  Plans dort steht und die Projektion nicht mehr `incremental-in-progress` ist. Anlass: Eine BayWü-Datei mit einem
  NUL-Zeichen im SQL-Text (aus einer Quellseite) wurde remote nach dem Zeichen abgeschnitten, Wrangler meldete dennoch
  Erfolg. Seitdem lehnt `sqlLiteral` NUL-Zeichen ab (`packages/runtime/src/projection.ts`), und die BayWü-Normprüfung
  sperrt Steuerzeichen im Text. Wiederherstellung eines teilweise eingespielten Stands: vollständige Projektion
  (`d1:plan` ohne `--incremental`) für genau diese Datenbank.
- Inkrementell: `npm run d1:plan -- --jurisdiction west --incremental --since <git-ref>` oder
  `--state data/runtime/projection-state-west.remote.json` projiziert nur neue, geänderte und entfernte Normen
  (Fingerabdruck je Norm, `packages/runtime/src/incremental.ts`). Jede inkrementelle Datei beginnt mit einer
  Basisprüfung: stimmt der Projektionszustand der Zieldatenbank nicht mit der Planbasis überein, bricht die
  Datei mit einem SQL-Fehler ab, bevor etwas geändert wird.
- Nach der letzten Datei wird `state.json` als Remote-Zustand übernommen
  (`data/runtime/projection-state-<jur>.remote.json`, nicht in Git).
- Skalierungsnachweis: `npm run d1:scale-test -- --write` (5 000 synthetische Normen; Bericht
  `data/audits/recht-nrw/d1-scale.json`).

## Worker

`npm run build` erzeugt `apps/web/dist/` (Client-Assets + `dist/server/wrangler.json`).
Deployment: `npm run deploy` (`wrangler deploy --config dist/server/wrangler.json --env ""`),
Staging: `wrangler deploy --config apps/web/dist/server/wrangler.json --env staging`.

Der Worker liest für Normseiten nur D1; R2 wird von Normseiten nie gelesen. Einzige Ausnahme sind die
**Abbildungs-Assets** normativer Abbildungen (`figure`-Blöcke): `GET /assets/<land>/<sha256>.<gif|jpg|png>`
(`apps/web/src/pages/assets/[jurisdiction]/[file].ts`, Logik `apps/web/src/lib/assets.ts`) liest aus dem privaten
Bucket über `LANDESRECHT_QUELLEN` genau einen Schlüssel unter dem Asset-Präfix des Landes
(`packages/runtime/src/assets.ts`, BayWü: `baywue/bayernrecht/2023-12-01/assets/`). Zulässig sind nur Dateinamen
aus einem SHA-256 (Kleinbuchstaben) und einer erlaubten Endung; alles andere ist 404, bevor R2 gefragt wird. Vor
der Auslieferung wird der Inhalt gegen den SHA-256 der Adresse geprüft (Abweichung: 502, nicht cachebar); die
Antwort ist `immutable` mit `nosniff`. Der Bucket bleibt privat; Rohpakete, Umschläge und Belege sind über diese
Route nicht erreichbar. Länder ohne Asset-Präfix (West) haben keine Assets.

**Umleitung stillgelegter Norm-Slugs.** Ein sachlich falscher Slug (einzeln entschieden in
`data/imports/<adapter>/slug-migrations.json`) wird stillgelegt, nie wieder vergeben und dauerhaft umgeleitet. Die
Importer schreiben die Zuordnung alt → neu aus ihrer Slug-Registry nach `packages/legal-core/src/config/slug-redirects.json`.
Die Middleware (`apps/web/src/middleware.ts`, Logik `apps/web/src/lib/norm-redirects.ts`) antwortet für
`/<land>/norm/<alt>/…` und `/api/v1/norms/<land>/<alt>…` mit 301 auf den Nachfolger; Unterpfad und Abfrage bleiben
erhalten. Die Datei ist Teil des Worker-Bundles; eine neue Umleitung braucht deshalb ein Deployment.

Nach jeder Änderung unter `apps/web/` ist ein Redeploy nötig (`npm run build && npm run deploy`).

### Healthcheck und Fehlermodus

- `GET /health` (nicht cachebar): `{ status: ok|error, worker: ok, storage: d1|file, d1: { LANDESRECHT_WEST: ok|missing|error|timeout, OSTRECHT_RECHT: ok|incomplete|…, … }, checkedAt }`
  – je Laufzeit-D1-Binding ein `SELECT 1` mit 3-s-Frist (Ost: `OSTRECHT_RECHT` mit `sync_state = complete`, sonst
  `incomplete`); HTTP 200 bei `ok`, sonst 503. Kein R2-Zugriff, keine Bestandszahlen, keine Umgebungswerte
  (`apps/web/src/lib/runtime/health.ts`, Test `tests/unit/web-runtime-health.test.ts`). Für Monitoring: 200 +
  `status: ok` erwarten.
- Such-Readiness: `/health` führt `search.OSTRECHT_RECHT` (`readiness`, `fullText`, `staleNormCount`); fehlen am
  Landesrecht-Stichtag geltenden Ost-Fassungen die Sucheinheiten, ist der Status `degraded` (HTTP 200). Monitoring, das
  auf vollständige Suche angewiesen ist, prüft `status: ok`.
- Smoke: `npm run smoke [-- --base <url>]` (`scripts/smoke.ts`) prüft alle vier Länder gegen den tatsächlichen
  API-Vertrag; `/health` wird beim Kaltstart bis zu dreimal abgefragt, ein bleibendes 503 ist ein Fehler.
- Konfigurationsfehler: Fehlt im Worker ein Laufzeit-D1-Binding (oder ist es keine D1-Datenbank), wirft
  `getStoreRegistry()` einen `RuntimeConfigurationError`; ein verletzter Schema-Contract der OstRecht-D1
  (`OstRechtContractError`) wird gleich behandelt (fail-closed, keine Teilkonfiguration, kein Rückfall auf Dateien). Die
  Middleware `apps/web/src/middleware.ts` beantwortet ihn mit HTTP 500 `text/plain`, `cache-control: no-store` und
  interner Meldung (Binding-Namen, Hinweis auf `wrangler.jsonc`/`--env`) und schreibt eine Zeile ins Worker-Log –
  nie eine stille leere Website (`apps/web/src/lib/runtime/configuration.ts`, Test
  `tests/unit/web-runtime-configuration.test.ts`).
- Bundle: `apps/web/dist/server` ≈ 0,9 MB (Astro-Runtime, Seiten, Runtime-Pakete); Inhalte kommen ausschließlich aus
  D1, Rohquellen und `content/` sind nicht im Bundle (der Dateiloader `node:fs` wird nur außerhalb des Workers
  dynamisch geladen). Nach dem Build prüfen: `du -sh apps/web/dist/server` und `grep -rl "recht.nrw.de/lrgv"
  apps/web/dist/server` (leer).

## Lokaler Worker

`npm run d1:seed:dev` (Teil von `npm run dev`) spielt Migrationen und Projektion über
`wrangler d1 execute --local` in die Miniflare-D1 unter `apps/web/.wrangler/state` ein; `astro dev`
und `wrangler dev` lesen daraus. Ein Remote-Zugriff findet dabei nicht statt.

## R2-Transporte für den Upload der Rohquellen

`npm run import:recht-nrw:r2-sync -- --write --r2-transport <transport> [--concurrency n] [--verify readback|etag]`
(wiederholbar; vorhandene Objekte mit gleichem Inhalt zählen als `already-present`, anderer Inhalt ist ein harter
Fehler; `--help` zeigt alle Optionen). Entscheidung: **`wrangler` ist der Standardtransport**, `wrangler-api` ist
optional, lokal und best effort, `s3` der CI-Weg.

| Transport | Anmeldung | Einsatz | Grenzen |
| --- | --- | --- | --- |
| `wrangler` (Standard) | Wranglers eigene OAuth-Anmeldung (`npx wrangler login`); der Importer liest keine Tokens, Wrangler erneuert selbst | lokal, nachvollziehbar, dieselbe Anmeldung wie `wrangler deploy` | ein Prozess je Aufruf (≈6 Aufrufe je Objekt), höchstens 8 Einträge gleichzeitig; Zeitlimit 300 s je Prozess, dann Wiederholung |
| `s3` | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (R2-API-Token mit Objekt-Lesen/Schreiben) | CI und nichtinteraktive Läufe | Schlüssel müssen angelegt und rotiert werden (`.env.example`) |
| `wrangler-api` | Token aus Wranglers Anmeldedatei oder `CLOUDFLARE_API_TOKEN` (vorrangig, wie bei Wrangler) | lokal, wenn viele kleine Objekte schnell übertragen werden sollen (`--concurrency 32 --verify etag`, ≈2 Objekte/s im API-Ratenlimit) | siehe Einordnung unten |

Prüfregime (`archive.ts`): `readback` = Vorabprüfung, Upload, Byte-Rücklesung mit SHA-256 je Objekt und Umschlag
(6 Aufrufe je Objekt, ≈0,6 Objekte/s im API-Ratenlimit); `etag` = Bucket-Listing je 1000 Objekte für Vorab- und
Nachprüfung über Größe und Etag (von R2 berechneter MD5), dazu 2 % zufällige Byte-Rücklesungen; Manifest je Charge
erst nach der Nachprüfung (braucht ein Listing: `s3` oder `wrangler-api`).

Alle Netzpfade (`fetcher.ts` für recht.nrw.de, `s3`, `wrangler-api`) haben ein hartes Zeitlimit je Aufruf über
Kopfzeilen **und** Körper (Fetcher 20 s, R2-HTTP 15 s), begrenzte Wiederholungen mit wachsendem Abstand und
`Retry-After` (gedeckelt: Fetcher bricht bei > 120 s kontrolliert ab, R2-Transporte warten höchstens 60 s);
Wrangler-Prozesse werden nach 300 s beendet und wiederholt. Ein Lauf hängt nie unbegrenzt; nach einem Abbruch
setzt `r2-sync` bzw. `bulk --resume` am Manifest-/Enumerationsstand fort.

### Einordnung `wrangler-api` (kritisch)

- **Keine öffentliche API.** Das Paket `wrangler` (4.x) exportiert keine Funktion für die OAuth-Anmeldung
  (Exporte: `getPlatformProxy`, `unstable_dev`, `unstable_readConfig`, `startRemoteProxySession`, …). Der Weg über
  `getPlatformProxy` mit experimentellen Remote-Bindings wäre ein halböffentlicher Ersatz, ist aber als
  `experimental` markiert und startet einen Proxy-Worker; er wird nicht verwendet. `wrangler-api` liest deshalb
  Wranglers **interne** Anmeldedatei `.wrangler/config/default.toml` (flache TOML-Datei mit `oauth_token`,
  `expiration_time`, `refresh_token`, `scopes`, optional `api_token`). Das Format kann sich mit einer
  Wrangler-Version ändern; dann endet der Transport mit „unerwartetes Format“ und der Hinweis lautet
  `--r2-transport wrangler`. Er ist deshalb ein lokaler Spezialpfad, kein Standard.
- **Wo gelesen wird:** `XDG_CONFIG_HOME`, sonst der Konfigurationsordner des Systems (macOS
  `~/Library/Preferences`, Windows `%APPDATA%`, sonst `~/.config`), dazu `~/.wrangler` – alles aus der Umgebung
  abgeleitet, nichts benutzerspezifisch fest. `CLOUDFLARE_API_TOKEN` hat Vorrang (dann keine Datei).
- **Fail-closed:** Nur die drei bekannten Felder werden gelesen, ausschließlich als einfache Strings mit Token-Form;
  Tabellen, mehrzeilige Werte oder andere Formen sind Formatfehler. `refresh_token` wird nie gelesen.
- **Tokenwerte** stehen nie in Logs, Fehlermeldungen (`R2TransportError` nutzt `redactSecrets` als zweite
  Schranke) oder der Diagnosedatei `R2_API_DEBUG=<datei>` (nur Methode, Schlüssel, Versuch, Status, Dauer).
- **Ablauf/Rotation:** Läuft das Token in < 60 s ab oder antwortet die API mit 401, wird die Datei einmal neu
  gelesen (ein anderer Wrangler-Prozess kann rotiert haben); sonst genau eine Erneuerung über `wrangler whoami`
  (gleichzeitige Worker teilen sie). Bleibt das Token ungültig, endet der Lauf mit `npx wrangler login`-Hinweis;
  Folgeaufrufe scheitern sofort (keine Endlosschleife, kein weiterer Prozessstart).
- **`wrangler logout` / CI:** fehlende oder leere Datei → sofortige Meldung mit Alternativen (`wrangler login`,
  `CLOUDFLARE_API_TOKEN`, `--r2-transport s3`).
- **Mehrere Konten:** ohne `CLOUDFLARE_ACCOUNT_ID` (oder `R2_ACCOUNT_ID`) bricht der Transport bei ≠ 1 Konto ab –
  keine stille Auswahl.
- **Erwartete Berechtigungen** der Wrangler-Anmeldung: `account:read` (Kontoermittlung) und `workers:write`
  (R2-Objekt-API `/accounts/{id}/r2/buckets/{bucket}/objects`); beides im Standardumfang von `wrangler login`.
  Für `CLOUDFLARE_API_TOKEN`: Workers R2 Storage – Bearbeiten.
- **Tests** (`tests/unit/recht-nrw-r2-wrangler-api.test.ts`, `…-http.test.ts`) decken alle Fälle mit Fake-Fetch
  und Fake-Dateien ab; keine echten Tokens.

### BayWü (`import:bayernrecht:r2-sync`)

`npm run import:bayernrecht:r2-sync -- --write --r2-transport wrangler-api --concurrency 32 --verify etag` stagt die
Exportpakete der übernommenen BayWü-Normen aus `.cache/bayernrecht/` nach `.cache/bayernrecht-r2-staging/`, prüft
Manifest ↔ Staging (fehlende Objekte oder abweichende SHA-256 sperren den Sync), überträgt nach
`landesrecht-quellen` unter `baywue/bayernrecht/2023-12-01/` und prüft nach (Listing mit Größe/Etag, deterministische
Byte-Stichprobe, Bucketzählung vorher/nachher). Bericht: `data/audits/bayernrecht/R2_AUDIT.{json,md}`. Abweichend
vom West-Sync: nur die Transporte `wrangler` und `wrangler-api` (ausschließlich Wrangler-OAuth; ein gesetztes
`CLOUDFLARE_API_TOKEN` oder ein API-Token in der Anmeldedatei wird abgelehnt), Präfixschutz auf jedem Schlüssel,
Umschläge bytegleich zwischen Staging und R2, Zeitlimit je HTTP-Aufruf 180 s (Pakete bis rund 36 MB). Muss die
Anmeldung interaktiv erneuert werden, endet der Lauf mit Exit 2 und nennt den Wiederaufnahmebefehl.
Rückgerechnete Normen bringen die Verkündungsseiten ihrer Belege (zurückgenommene Änderung, Beginn der
Stichtagsfassung) als weitere Rohdokumente mit; sie werden auf demselben Weg archiviert.

Umschläge sind wie Rohobjekte unveränderlich. Maßgeblich sind ihre **Kernfelder** (Schlüssel, Bucket, SHA-256,
Größe, Medienart, Adressen, Abrufzeit, Quellidentität, Bereich). Ändert sich nach einer Parserkorrektur nur ein
beschreibendes Feld (Quelltitel), bleibt der archivierte Umschlag stehen: Das Staging behält ihn, der Sync übernimmt
bei Abweichung den archivierten Stand ins Staging, und die Audits zählen solche Umschläge („archivierter Stand
beibehalten“), statt zu scheitern. Weicht ein Kernfeld ab, bricht der Sync ab; überschrieben wird nie.

### Inkrementelle D1-Runde

`npm run d1:plan -- --jurisdiction <land> --incremental` vergleicht den Bestand mit dem Remote-Projektionszustand
(`data/runtime/projection-state-<land>.remote.json`) und schreibt nur neue, entfernte und geänderte Normen neu –
geändert heißt: anderer Datensatz **oder** andere Sucheinheiten (so kommen auch Änderungen am Code der
Sucheinheiten remote an). Der erste Batch prüft in SQL, dass die Remote-D1 genau auf dem Vorzustand steht. Danach
`npm run d1:seed:dev -- --jurisdiction <land>` und `d1-remote-check.ts`: Der Vergleich mit der frisch gesäten
lokalen Vollprojektion zeigt, dass die inkrementelle Runde dasselbe ergibt wie eine vollständige.

### Sim-Rechtsfortschreibung (Release-Reihenfolge)

Nach `docs/SIMULATION_IMPORT.md`, nur bei grünen Gates (`npm run content:check` enthält `content:simulation-gates`):
`import:simulation:consolidate -- --jurisdiction <land> --write` und `--check`, `import:simulation:ledger-sync -- --jurisdiction <land> --write`,
`import:simulation:completeness -- --write` (Block `simulation` im Teilbestandshinweis), `import:simulation:r2-sync -- --write`
(Originale nach `<land>/simulation/<sha256>.<ext>`, nie überschreiben), dann je Land die inkrementelle D1-Runde (oben; Sim-Normen,
neue Fassungen, additive Meta, `law_publications`), `npm run build && npm run deploy` (Teilbestandshinweis ist in den Build
eingebacken) und Smoke: `/<land>/verkuendungen/`, eine Sim-Norm, eine fortgeschriebene Baseline-Norm mit historischer
Fassung (`/version/2023-12-01/`), `/api/v1/search` (Treffer zeigt die am Stichtag geltende Fassung). Stichtag vorrücken (`packages/legal-core/src/config/editorial.json`, nur vorwärts): danach je Land
`consolidate --write` (Status `future-effective` → `in-force` additiv), `content:check`, und – weil der Stichtag Teil des
Projektionszustands ist – eine **vollständige** D1-Projektion je Land (`d1:plan` meldet „redaktioneller Stichtag … →
…“ und erzeugt den Vollplan), dann Build/Deploy. Der West-, NSH- und BayWü-Freeze
werden nicht über einen Hash aller Dateien nachgewiesen (Sim-Fortschreibung ergänzt `meta.json`/`history.json`), sondern
über Gate G2 (alle `versions/2023-12-01.json` byteidentisch mit dem Freeze-Commit, keine neue Baseline-Norm ohne Freigabe)
und G3 (additiv); für NSH und BayWü vergleichen zusätzlich `node scripts/nsh-freeze-readiness.ts` bzw.
`node scripts/baywue-freeze-readiness.ts` den Baseline-Fingerabdruck (`docs/NSH_BASELINE_FREEZE.md`,
`docs/BAYWUE_BASELINE_FREEZE.md`). Ein reiner Freeze-Metadatenwechsel braucht keine D1- oder R2-Neuprojektion; neu gebaut und
deployt wird nur, wenn sich die Oberfläche ändert (Baseline-Status im Bestandshinweis).

## Offen

- Playwright-Smokes gegen den lokalen Worker (Muster: OstRecht `serve-law-worker`).
- Domain/Routes in `wrangler.jsonc` nach Festlegung der öffentlichen Site-URL.
