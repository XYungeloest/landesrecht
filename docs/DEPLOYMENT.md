# Deployment

Noch nicht deployt. Dieses Dokument beschreibt die vorbereitete Struktur.

## GitLab-CI (`.gitlab-ci.yml`)

Stufen: `install` (npm ci) → `check` (`npm run check`, `content:check`, `d1:schema:check`) →
`test` (`npm run test`, JUnit-Report) → `build` (`npm run build`, Artefakt `apps/web/dist/`) →
`deploy` (nur Produktionsbranch `main`, nur manuell, nur nach erfolgreichen Prüfungen).

Deploy-Jobs brechen kontrolliert ab, wenn die Zugangsdaten fehlen. Es werden keine
GitHub-Actions-Workflows verwendet.

### CI/CD-Variablen (Projekt-Settings → CI/CD → Variables, maskiert + geschützt)

| Variable | Zweck |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare-Konto für Wrangler |
| `CLOUDFLARE_API_TOKEN` | Token mit Rechten für Workers Scripts, D1 und R2 (Schreiben) |

Optional: `SITE_URL` (öffentliche Origin für Canonical-Links; Standard in `astro.config.mjs`).
Keine Secrets im Repository (`.env` ist ignoriert, `.env.example` dokumentiert die Namen).

## Cloudflare-Ressourcen (manuell anlegen)

```sh
npx wrangler d1 create landesrecht-west
npx wrangler d1 create landesrecht-nsh
npx wrangler d1 create landesrecht-ost
npx wrangler d1 create landesrecht-baywue
npx wrangler r2 bucket create landesrecht-quellen
# Staging analog mit Suffix -staging
```

Die zurückgegebenen `database_id`-Werte ersetzen die Platzhalter in `apps/web/wrangler.jsonc`
(Muster `00000000-0000-4000-8000-0000000000NN`). Bindings: `LANDESRECHT_WEST|NSH|OST|BAYWUE`,
`LANDESRECHT_QUELLEN` (`packages/runtime/src/bindings.ts`). Die Worker-Environments erben
Bindings nicht; `env.staging` deklariert eigene Datenbanken und einen eigenen Bucket
(`tests/unit/content-and-config.test.ts` prüft das).

## D1-Schema und Projektion

```sh
npx wrangler d1 migrations apply landesrecht-west --remote   # data/d1/*.sql, je Datenbank
npm run d1:apply:remote                                       # schreibt data/runtime/landesrecht-<jur>.sql
npx wrangler d1 execute landesrecht-west --remote --file data/runtime/landesrecht-west.sql
```

Die Projektion ist deterministisch (`projection_fingerprint` in `law_runtime_meta`); sie läuft
nie automatisch gegen eine produktive Datenbank. Lokale Prüfung: `npm run d1:seed:local`,
`npm run d1:schema:check`. Reihenfolge bei Änderungen: lokal → Staging → Produktion.

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

Der Worker liest nur D1; fehlen alle Bindings, wirft `getStoreRegistry()` einen Fehler statt auf
Dateien zurückzufallen. R2 wird von Normseiten nie gelesen.

## Lokaler Worker

`npm run d1:seed:dev` (Teil von `npm run dev`) spielt Migrationen und Projektion über
`wrangler d1 execute --local` in die Miniflare-D1 unter `apps/web/.wrangler/state` ein; `astro dev`
und `wrangler dev` lesen daraus. Ein Remote-Zugriff findet dabei nicht statt.

## Offen

- Playwright-Smokes gegen den lokalen Worker (Muster: OstRecht `serve-law-worker`).
- R2-Upload der gestagten RECHT.NRW-Rohquellen über die bestehende Wrangler-Anmeldung (`npx wrangler login`),
  ohne zusätzliche API-Tokens oder S3-Schlüssel:
  `npm run import:recht-nrw:r2-sync -- --r2-transport wrangler-api --write --concurrency 32 --verify etag`
  (wiederholbar; bereits vorhandene Objekte mit gleichem Inhalt zählen als `already-present`, anderer Inhalt ist
  ein harter Fehler). `wrangler-api` liest das OAuth-Token aus Wranglers eigener Anmeldedatei (nur im Speicher;
  Erneuerung über `wrangler whoami`) und ruft dieselben R2-Endpunkte direkt auf, die `wrangler r2 object` nutzt.
  Das Cloudflare-API-Ratenlimit (≈4 Aufrufe/s im Mittel, 429 bei Bursts) begrenzt den Durchsatz, deshalb zwei
  Prüfregime: `--verify readback` (Standard: Vorabprüfung, Upload, Byte-Rücklesung mit SHA-256 je Objekt und
  Umschlag = 6 Aufrufe je Objekt, ≈0,6 Objekte/s) und `--verify etag` (Bucket-Listing je 1000 Objekte für
  Vorab- und Nachprüfung über Größe und Etag = von R2 berechneter MD5 der gespeicherten Bytes, dazu 2 % zufällige
  Byte-Rücklesungen mit SHA-256 = 2 Aufrufe je Objekt, ≈2 Objekte/s; Manifest wird je Charge erst nach der
  Nachprüfung geschrieben). `--r2-transport wrangler` (Wrangler-Prozesse, höchstens 8 gleichzeitig) bleibt als
  Alternative; der S3-Weg (`.env.example`) bleibt für CI dokumentiert.
- Domain/Routes in `wrangler.jsonc` nach Festlegung der öffentlichen Site-URL.
