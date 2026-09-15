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
- Inkrementelle Projektion aus `git diff` mit Budgetprofilen (OstRecht-Muster), sobald der
  Bestand groß wird.
- Domain/Routes in `wrangler.jsonc` nach Festlegung der öffentlichen Site-URL.
