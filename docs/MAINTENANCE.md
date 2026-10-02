# Laufender Betrieb

Routine für neue Sim-Quellen, neue Baseline-Evidenz, Ost und den lokalen Entwicklungsbetrieb. Keine Websuche; beschafft
wird extern und von Hand. Was noch fehlt, zeigt `npm run sources:needed` (`--land west|nsh|baywue`, `--priority P1`).

## Releaseprüfung

- Vor Commit/PR: `npm run release:check -- --offline` (vollständig lokal).
- Vor und nach Deployment mit Netz: `npm run release:check` (zusätzlich Produktionsprüfungen).
- Umfassender Betriebscheck: `npm run release:check -- --full` (zusätzlich beratende Remote-D1-, R2- und Performance-Audits).

Offline entfallen bewusst Remote-Ost-Contract/Drift/Freshness, Produktions-Smoke und Website-Stichprobe sowie
die Remote-Audits von `--full`. Die lokalen Ost-Contract-Tests laufen weiterhin mit Vitest. Im normalen Lauf
bleiben fehlgeschlagene Produktionsprüfungen blockierend.

`audit:reconstruction` liest die VV-LHundG-Evidenz (`term:23528`) ausschließlich über das versionierte
Manifest `data/imports/recht-nrw/manifest/lrmb/term-23528.json` aus `sources/recht-nrw/term-23528/`.
SHA-256 und Bytezahl werden geprüft; zwei isolierte Rekonstruktionsläufe vergleichen Rezept,
Schrittkette und Ergebnis mit dem eingefrorenen Bestand. Der temporäre Abrufcache ist keine Voraussetzung.
Fehlende oder abweichende Archivdateien erzeugen einen Fehlerbericht mit Source-ID, Pfad und erwartetem Hash;
es gibt weder einen Live-Abruf noch ein stilles Überspringen. Ohne die Primärevidenz ist das akzeptierte
Rezept nicht vollständig auditierbar; dann muss die exakt archivierte Datei wiederhergestellt werden.

## Source-Inbox `imports/`

`imports/` ist gitignored und die manuelle Inbox: Landesordner `west/`, `nsh/`, `baywü/`. `bund/` enthält
Bundesportal-Material und ist nie Sim-Quelle. `Archiv.zip` wird nur mit dem Ordnerinhalt abgeglichen. Dateien werden
nie automatisch gelöscht oder verschoben, und keine Rohquelle kommt ins Git. Die Kopien nach SHA-256 liegen unter
`.cache/simulation/`, die R2-Archivierung läuft über `import:simulation:r2-sync`. Unterstützt sind PDF mit Textebene,
DOCX, TXT, MD und HTML; ohne Textebene gibt es kein OCR, die Datei geht ins Human Review.

## Neue Sim-Quelle

1. Datei in den passenden Landesordner unter `imports/` legen.
2. `npm run sources:intake` (Dry-run). Die Ausgabe erscheint im Terminal, der Bericht in
   `data/audits/source-intake/latest.json`; beide sind bei unveränderter Inbox byteidentisch.
3. Bericht prüfen. Je Datei:

   | Ergebnis | Bedeutung |
   | --- | --- |
   | `already-known` | Hash ist bereits im Inventar. |
   | `matched` | Eindeutige Zuordnung zu einem Queue-Eintrag. |
   | `possible-match` | Schwach, nie automatisch. |
   | `new-untracked-source` | Neue Quelle ohne Queue-Eintrag. |
   | `needs-human-review` | Mehrdeutig, widersprüchliches Land, kein Text, kein Landesordner oder `freeze-review-candidate`. |
   | `irrelevant/non-simulation` | Keine Sim-Quelle (z. B. `bund/`, `Archiv.zip`). |

   Das Matching arbeitet mehrstufig: Hash, Publikationsidentität, internes Aktenzeichen, Titel/Datum. Der Dateiname dient
   nur ergänzend.
4. `npm run sources:intake -- --write` führt nur sichere Schritte aus:
   - Das Inventar wird geschrieben, wenn jede neue Landesdatei `matched` ist.
   - Ein eindeutig zugeordneter Eintrag geht von `open` auf `candidate-found`.
   - Danach läuft `completeness --write`.
5. Fachliche Verarbeitung von Hand:
   - Evidenzprüfung in `data/simulation/<land>/sources.json`.
   - Verkündung unter `content/publications/<land>/`, Akte und Rezepte unter `data/simulation/<land>/`.
   - Ledger-Ereignis und Lücke in `completeness.json` fortschreiben (Ausgabe in `presentIssues`, Status).
   - Inhaltsverzeichnis der Ausgabe: `npm run import:simulation:publications -- --write` (jeder abgedruckte Akt als Eintrag,
     auch ohne Portalnorm; Gate G12).
   - Konsolidierung: `npm run import:simulation:consolidate -- --jurisdiction <land> --write`, dann `ledger-sync`.
6. Erneut `npm run sources:intake -- --write`. Erst jetzt wird der Eintrag `resolved`: Die Quelle ist inventarisiert und
   von einer Verkündung oder einem Ledger-Ereignis belegt, die Lücke ist im Audit geschlossen. Die Auflösung trägt
   `resolvedBySha256`, `resolvedAt`, `sourceInventoryId` sowie die Verkündungen und Ereignisse.
7. Gates: `npm run content:simulation-gates` (Freeze 0 Abweichungen), `npm run content:check`, `npm run test`.
8. Projektion: D1-Projektion des Landes und R2 (`import:simulation:r2-sync -- --stage-only`, dann `--write`), nur wenn
   sich Inhalte geändert haben.
9. `npm run release:check` (Exit 1 nur bei Releaseblockern), dann `npm run deploy`, danach `npm run smoke`.

Queue-Lebenszyklus (`data/simulation/<land>/completeness.json` → `sourceGaps[].acquisition`; die Queue wird daraus
erzeugt):

| Status | Bedeutung |
| --- | --- |
| `open` | Quelle wird gesucht. |
| `candidate-found` | Datei gefunden, noch nicht verarbeitet. |
| `resolved` | Quelle verarbeitet, Lücke geschlossen. |
| `rejected` | Beschaffung verworfen (`reason`), die Lücke bleibt offen. |
| `superseded` | Ersetzt durch einen anderen Eintrag (`supersededBy`). |

`rejected` und `superseded` setzt nur ein Mensch.

## Neue Baseline-Evidenz

West, NSH und BayWü sind eingefroren (`data/simulation/baseline-locks.json`).

1. Der Intake meldet eine Datei als `freeze-review-candidate`, wenn sie vor dem Ausgangsrechtsstand datiert oder dem Titel
   einer aus dem Freeze ausgeschlossenen Zielnorm entspricht (`missing-baseline-target`). Gemeldet werden Land, Quelle,
   neue Evidenz, aktueller Ausschluss, erwarteter Nutzen und Freeze-Commit.
2. Es gibt keine automatische Änderung: kein Import, kein Seed, keine Konsolidierung.
3. Human Review der Evidenz.
4. Nur mit ausdrücklicher Entscheidung folgt eine Freeze-Ausnahme `kind: "added"` bzw. `regenerated` mit
   `baseCommit` = Freeze-Commit in `data/content-immutability-exceptions.json` (`docs/*_BASELINE_FREEZE.md`).

## Ost

Ost wird ausschließlich upstream in OstRecht gepflegt. Hier gibt es keinen Import, keine Queue, keine Inbox. Vor dem
Fortschreiben des Stichtags läuft `npm run audit:ost-drift -- --as-of <Datum>`.

## Lokaler Entwicklungsbetrieb

`astro dev` (`npm run dev`) ist der einzige Entwicklungsmodus (Vite `DEV`). Der vorgeschaltete Seed überspringt aktuelle
lokale D1s; der erste Start nach `npm run build` läuft dank getrennter Vite-Caches stabil (`docs/DEPLOYMENT.md`, Lokaler
Worker). In einer Agent-Umgebung startet Astro 7 den Dev-Server selbst im Hintergrund (`astro dev status|logs|stop`). Jeder gebaute Worker (Produktion, Staging)
bleibt fail-closed: Alle Bindings sind Pflicht, ein verletzter Ost-Contract ergibt 500, `/health` antwortet mit 503.

Lokal gilt:

- **Fehlt `OSTRECHT_RECHT`** oder ist die lokale D1 leer bzw. ohne OstRecht-Schema:
  - Ost ist `unavailable-local`.
  - West, NSH und BayWü arbeiten normal.
  - `/api/v1/jurisdictions` antwortet mit 200; Ost trägt `availability`, `normCount` 0 und keine Suchabdeckung.
  - Ost-Seiten und `/api/v1/{norms,publications}/ost/…` antworten mit 503 und einer Diagnose.
  - Eine Suche nur über Ost ergibt 503. Eine gemischte Suche läuft ohne Ost und weist die Lücke aus (`unavailable`).
  - `/health` meldet `degraded` (200) mit `mode: development` und Diagnose.
- **Lokale OstRecht-Kopie mit gültigem Schema** (lokale D1 oder `OSTRECHT_D1_SQLITE`, etwa die Testfixture): Status
  `fixture`, nur Entwicklung und nie als vollständiger Bestand ausgegeben.
- **Eigene Bindings** (West, NSH, BayWü) bleiben auch lokal Pflicht.
