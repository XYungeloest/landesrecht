# NSH: Remote-Freigabe – vorbereitete Artefakte, Reihenfolge, Smoke-Plan

**Stand 2026-09-19 (Run 7). Nichts davon ist ausgeführt.** NSH ist `TECHNICALLY READY`, die Remote-Freigabe steht auf
`REMOTE RELEASE PENDING SOURCE-RIGHTS DECISION` (`npm run import:juris-sh:readiness`). Einziger offener Punkt ist die
Quellenrechts-/Datenbankfrage (TDM-Vorbehalt, Weiterveröffentlichung der juris-Konsolidierung;
`docs/NSH_SOURCE_RIGHTS_AND_PROVENANCE.md`, `docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`). Bis zur Entscheidung: kein
R2-Upload, kein Remote-D1-Apply, kein Deploy für NSH. `r2-sync --write` verweigert den Upload technisch, solange
`data/imports/juris-sh/source-rights-approval.json` keine Entscheidung `approved` trägt.

## 1 Vorbereitete Artefakte (lokal, nicht in Git bzw. nicht remote)

| Artefakt | Ort | Inhalt |
| --- | --- | --- |
| Bestand | `content/norms/nsh/` | 2 383 Normen (1 340 Landesrecht, 1 043 VwV), 7 149 Dateien |
| Manifest | `data/imports/juris-sh/manifest/` | 5 195 Einträge; übernommene mit `archiveStatus: staged` |
| R2-Staging | `.cache/juris-sh-r2-staging/nsh/juris-sh/2023-12-01/` | 7 727 Objekte (705 MB): Rohquellen (PDF-Ausgaben, Einzelfassungen, Anlagendokumente) und 405 Abbildungs-Assets unter `assets/<sha256>.<png|jpg>`, je mit Umschlag; 0 Konflikte; Bericht `data/audits/juris-sh/R2_STAGING.{json,md}` |
| Lokale D1 | `data/runtime/landesrecht-nsh.sqlite` (`project-d1 --target local --reset --jurisdiction nsh`) | 2 383 Normen, 2 383 Fassungen, 32 229 Blöcke, 18 441 Sucheinheiten, 70 083 Anweisungen |
| Dev-D1 | `apps/web/.wrangler/state` (`npm run d1:seed:dev -- --jurisdiction nsh`) | dieselbe Projektion in der lokalen Miniflare-D1 |
| D1-Batches | `data/runtime/d1-batches/landesrecht-nsh/` (`project-d1 --target remote-batches --jurisdiction nsh`) | 63 SQL-Dateien (94,5 MB, größte 3,8 MB), 91 530 Anweisungen, `plan.json` mit Zielfingerabdruck `2566c89c`, vollständige Projektion (`mode: full`) |

## 2 Reihenfolge nach der Freigabe (nur nach menschlicher Entscheidung)

Voraussetzung: Entscheidung dokumentiert in `data/imports/juris-sh/source-rights-approval.json`
(`{"decision": "approved", "decidedBy": "…", "decidedAt": "…", "scope": "…"}`); danach meldet die Readiness
`REMOTE RELEASE APPROVED`. Wrangler-Anmeldung nur per OAuth (`npx wrangler login`).

```bash
# 0. Stand prüfen (netzfrei)
npm run import:juris-sh:readiness            # erwartet: TECHNICALLY READY + REMOTE RELEASE APPROVED
npm run import:juris-sh:audit                # erwartet: konsistent, 2 383 Normen, 405 Abbildungen reproduziert
npm run content:check && npm run d1:schema:check

# 1. R2: Rohquellen und Assets hochladen (fortsetzbar, Präfixschutz nsh/juris-sh/2023-12-01/)
npm run import:juris-sh:r2-sync -- --write

# 2. D1-Schema zuerst: landesrecht-nsh hat remote noch kein Schema (aus apps/web)
cd apps/web && npx wrangler d1 execute landesrecht-nsh --remote --config wrangler.jsonc --file ../../data/d1/0001_landesrecht.sql --yes && cd ../..

# 3. D1-Batches: Dry-run, lokal, remote
npm run d1:apply:batches -- --database landesrecht-nsh                          # SHA-256, Reihenfolge, 63 offene Dateien
npm run d1:apply:batches -- --database landesrecht-nsh --local --execute
npm run d1:apply:batches -- --database landesrecht-nsh --execute --confirm-remote landesrecht-nsh --resume

# 4. Worker neu bauen und deployen (Asset-Präfix nsh und suchbare Gl.Nr. sind Codeänderungen dieses Laufs)
npm run build && npm run deploy
```

Zwischen den Schritten nichts anderes an `landesrecht-nsh` ausführen. Bricht Schritt 3 ab, mit `--resume` fortsetzen;
`d1-apply-batches` übernimmt den Projektionszustand erst, wenn remote `projection_fingerprint = 2566c89c` steht und die
Projektion nicht `incremental-in-progress` ist.

## 3 Smoke-Plan mit erwarteten Werten

```bash
# D1 remote gegen lokal (nur Lesezugriffe)
node scripts/d1-remote-check.ts --database landesrecht-nsh --sample 30 --write
```

| Prüfung | Befehl / Abfrage | Erwartet |
| --- | --- | --- |
| Normen | `npx wrangler d1 execute landesrecht-nsh --remote --config wrangler.jsonc --command "SELECT COUNT(*) FROM law_norms"` (aus `apps/web`) | 2 383 |
| Fingerabdruck | `… --command "SELECT value FROM law_runtime_meta WHERE key='projection_fingerprint'"` | `2566c89c` |
| lokal = remote | `d1-remote-check.ts` | alle Zähler gleich, 30/30 Stichproben gleich |
| Health | `curl -s https://<site>/health` | HTTP 200, `status: ok`, `LANDESRECHT_NSH: ok` |
| Suche NSH | `curl -s 'https://<site>/api/v1/search?q=AGBGB%20NSH&jurisdiction=nsh'` | erster Treffer `agbgb-nsh`, nur `jurisdiction: nsh` |
| Gl.Nr. | `curl -s 'https://<site>/api/v1/search?q=%226625.17%22&jurisdiction=nsh'` | unter den ersten Treffern `aenderung-der-bekanntgabe-einer-allgemeinverfuegung-zur-einschraenkung-nsh` (VwV, Nummer aus dem Normkörper in die Metadaten verlegt) |
| Länderfilter | Golden Set `data/audits/juris-sh/search/golden-queries.json` gegen die Instanz | keine fremden Treffer; Recall@10 wie lokal (`golden-results.md`) |
| Abbildung | `curl -sI https://<site>/assets/nsh/<sha256>.png` für ein Asset aus `R2_STAGING.json` | 200, `content-type: image/png`, `etag: "<sha256>"`, `immutable` |
| Asset-Schutz | `curl -sI https://<site>/assets/nsh/<sha256>.pdf` | 404, ohne R2-Zugriff |
| West/BayWü unverändert | `node scripts/project-d1.ts --target plan --jurisdiction west --incremental --state data/runtime/projection-state-west.remote.json` (ebenso `baywue`) | `noop`, unverändert 1 482 bzw. 1 696 |

## 4 Rückweg

- R2: Objekte sind inhaltsadressiert und unveränderlich; ein Rückzug ist eine eigene menschliche Entscheidung (Löschen im
  Präfix `nsh/juris-sh/2023-12-01/`), nie Teil eines Importlaufs.
- D1: `landesrecht-nsh` ist eine eigene Datenbank; ein Rückzug leert nur sie (vollständige Projektion eines leeren
  Bestands oder Schema neu). West und BayWü sind nicht berührt.
- Oberfläche: `packages/legal-core/src/config/inventory-status.json` weist NSH als Teilbestand aus.
