# Vollständiger Ausgangsimport RECHT.NRW → Land Westdeutschland (LRGV und LRMB)

Status: Werkzeuge umgesetzt und getestet, der vollständige Lauf ist noch nicht ausgeführt. Bereitschaft,
Policies, GO/No-Go-Checkliste und die genauen Befehle des Laufs stehen in
`docs/RECHT_NRW_BULK_READINESS.md`. Umfang nach `docs/LEGAL_SCOPE.md`: alle am 2023-12-01 geltenden
Gesetze, Rechtsverordnungen und landesweiten Verwaltungsvorschriften des Landes Nordrhein-Westfalen als
Recht des Landes Westdeutschland (`west`, Kurzname „West“), je Stammnorm genau eine Simulationsfassung
`2023-12-01`.

```text
Enumeration LRGV + LRMB (committet)            → Abgleich Sitemap ↔ Suchindex ↔ Term
Phase A  Bulk LRGV (Gesetze, Rechtsverordnungen) → Audit A (Coverage, Suche, Stichproben)
Phase B  Bulk LRMB (Verwaltungsvorschriften)     → Audit B (+ Rekonstruktionsqueue)
R2-Sync, D1-Batches lokal                        → Freigabe des West-Bestands
```

## Grundregeln

| Thema | Regel |
| --- | --- |
| Identität | `term:<id>` (Taxonomie-Term der Stammnorm) für beide Bereiche; vor dem ersten Abruf `stem:<typ>/<slug>`. Der Lauf löst die Term-ID über die Fassungsliste auf, führt Dubletten zusammen (`mergedInto`) und trennt fremde Adressen ab. |
| Rechtsumfang | Nur Eindeutiges wird übernommen; Zweifelsfälle (Normativität, Dokumentidentität, Geltung, PDF, Rekonstruktion) werden vollständig erfasst und in die Review-Queue gestellt, nie automatisch aufgenommen. |
| Fehlerklassen | Normlokale Fehler → `review` bzw. `failed`, der Lauf geht weiter. Systemische Fehler (Portalstruktur, Parserverlust, Sperren, R2-Ausfall, beschädigter Zustand) → kontrollierter Abbruch `aborted-systemic` mit Exit-Code 2. |
| Institutionen | `institution-mapping.json`; offene Zuordnungen blockieren nicht (`imported-with-warnings`, `originEnactingBody` = Quelle, `enactingBody` leer). Korrekter Text geht vor kosmetischer Umbenennung. |
| Bundesrecht | Verweise bleiben Text; der Bundesrechts-Provider bleibt funktionsfähig; keine irreversible Rohlink-Bindung. Kein Blocker. |
| Keine Umgehung | Keine Umgehung von Rate Limits, Sperren, CAPTCHAs oder Bot-Schutz; Sperrantworten beenden den Lauf. |

## Enumeration (`common/enumeration.ts`)

`npm run import:recht-nrw:enumerate -- --area lrgv|lrmb [--write]` liest den Sitemap-Index (47 Teilsitemaps)
und den Suchindex (`/search/middleware`, `search_after`-Paging, 500 Treffer je Seite) und schreibt
`data/imports/recht-nrw/enumeration-<bereich>.json` (`recht-nrw-enumeration/1`, ein Eintrag je Zeile,
deterministisch, kein Diff bei Wiederholung):

| Feld | Inhalt |
| --- | --- |
| `key`, `sourceIdentity` | `term:<id>` oder `stem:<typ>/<slug>` |
| `entryUrl`, `urls`, `portalType`, `title`, `titleSource` | Einstieg, alle Fassungsadressen des Stamms, Portaltyp, Titel (Suchindex vor Slug) |
| `status` | `pending | processing | done | review | failed | excluded` |
| `signals`, `search` | Sitemap/Suchindex, `field_historically`, Außerkrafttreten, Gültig ab (nur Hinweise) |
| `preclassification` | `likely-include | likely-exclude | review | unknown` mit Grund; ohne Abruf ausgeschlossen nur bei eindeutigem Titel |
| `role` | `norm-candidate` oder `evidence` (LRGV-Bekanntmachungen: Belege für Staatsverträge) |
| `attempts`, `lastError`, `outcome`, `lastRunId` | Fortschritt |

Stand der committeten Enumeration (15./16. September 2026):

| Bereich | Sitemap-Adressen / Stämme | Suchindex (Treffer / eindeutig) | Vereinigung = Schnittmenge + nur Sitemap + nur Suchindex | Einträge |
| --- | --- | --- | --- | --- |
| LRGV | 10 518 / 3 338 | 4 074 / 3 967 | 3 338 = 3 171 + 167 + 0 | 3 342 (2 766 likely-include, 5 review, 571 Belege) |
| LRMB | 6 532 / 5 971 | 6 351 | 5 971 = 5 953 + 18 + 0 | 5 974 (3 580 likely-include, 519 likely-exclude, 1 247 review, 628 unknown, 147 ohne Abruf ausgeschlossen) |

Die Enumeration wird vor dem Lauf nicht erneuert; `--write` einer neuen Enumeration übernimmt Status und
Fortschritt vorhandener Einträge.

## Bulk-Runner (`common/bulk-runner.ts`, `cli-bulk.ts`)

```sh
npm run import:recht-nrw:bulk -- --area lrgv|lrmb [--write] [--resume] [--limit n] [--only a,b]
  [--retry-failed] [--retry-review] [--regenerate-stale] [--refresh] [--offline]
  [--max-requests n] [--max-bytes n] [--max-runtime 8h] [--min-delay 1500]
  [--archive staging|r2] [--r2-transport s3|wrangler] [--staging-dir dir] [--output-root dir]
```

- **Dry-run ist Standard.** Ohne `--write` wird nichts geschrieben (Enumeration, Manifest, Queue, Inhalte,
  Archiv). `--output-root` lenkt einen Schreiblauf in eine Testumgebung.
- **Auswahl:** `pending` und unterbrochene `processing`-Einträge; zusätzlich `--retry-failed`,
  `--retry-review`, `--regenerate-stale` (Parser-/Transformerwechsel); `--only` (Term-ID, Schlüssel oder
  Adresse) und `--limit`. Ein Schreiblauf über vorhandenen Fortschritt verlangt `--resume`.
- **Je Stammnorm:** Checkpoint `processing` → Importpfad LRGV/LRMB → Rohquellen ins Archiv → Slug-Registry →
  Norm (Temp-Verzeichnis + Austausch) → Report → Review- und Manifest-Datei → Enumeration `done|review|
  failed|excluded`. Alle Dateien atomar (Temp-Datei → fsync → rename → Verzeichnis-fsync); unterbrochene
  Normschreibvorgänge werden beim nächsten Start zurückgerollt.
- **Signale:** Erstes SIGINT/SIGTERM beendet den Lauf nach der laufenden Stammnorm (`interrupted`, Exit 130),
  ein zweites bricht den laufenden Abruf ab; die offene Norm geht zurück auf `pending`.
- **Systemerkennung:** 20 Fehlschläge in Folge oder derselbe Fehlercode in 15 der letzten 25 Normen →
  `aborted-systemic`. Budget-, Sperr- und Abbruchfehler, Archivfehler und beschädigter Zustand beenden den
  Lauf sofort; die betroffene Norm bleibt `pending`.
- **Laufbericht:** `data/audits/recht-nrw/runs/recht-nrw-2023-12-01-<bereich>-<zeit>.json` mit Git-Commit,
  Parser-/Transformerversion, Stichtag, Bereich, Beginn/Ende, Budget, Abrufen, Cachetreffern, Bytes,
  Ergebnissen (übernommen, Review, fehlgeschlagen, ausgeschlossen, nicht am Stichtag, rekonstruiert,
  zusammengeführt, abgetrennt), Archiv (gestagt, hochgeladen, geprüft), Fehlerliste und Enumerationsstand.
  Laufstatus: `completed | limit-reached | nothing-to-do | budget-exhausted | interrupted | aborted-systemic`
  (`budget-exhausted` ist kein Fehler).

## Abrufe, Budgets, Cache (`common/fetcher.ts`)

| Regel | Wert |
| --- | --- |
| Mindestabstand | 1 500 ms zwischen Netzabrufen (`--min-delay`), strikt sequenziell |
| Timeout, Wiederholungen | 20 s; höchstens 3 Wiederholungen bei Timeout, Netzfehler, 5xx (Backoff 2 s, 4 s, 8 s) |
| 429/403 | `Retry-After` wird beachtet (Sekunden oder HTTP-Datum); 3 Sperrantworten in Folge oder `Retry-After` > 120 s → `blocked`, Lauf endet |
| Budgets | Bulk-Standard 3 000 Netzabrufe und 8 h je Lauf; optional Bytes; Enumeration 250 Abrufe |
| Cache | `.cache/recht-nrw/` (nicht in Git): Schlüssel aus URL (POST: Methode, URL, Body), Metadaten `finalUrl`, `status`, `contentType`, `retrievedAt`, `byteLength`, `sha256`, relevante Header; beschädigte Einträge zählen als Fehlschlag des Caches und werden online neu geladen, offline nie ersetzt; 404-Antworten werden negativ gecacht |
| Offline | `--offline` verarbeitet ausschließlich aus dem Cache (Regeneration ohne Netz); `--refresh` lädt kontrolliert neu |

Größenordnung: LRGV ≈ 2–4 Abrufe je Stammnorm (Einstiegsseite, Stichtagsfassung, Textdatei, Anlagen);
LRMB ≈ 2–6 (Fassungen, Ministerialblatt-Einträge, Anlagen). Bei 1,5 s Abstand sind 3 000 Abrufe ≈ 75 min.

## Rohquellen und R2 (`common/archive.ts`, `common/r2-transport.ts`)

- Objektschlüssel `west/recht-nrw/2023-12-01/term-<id>/<sha256[0..16]>-<rolle>.<ext>`, Rollen
  `version-page | text-document | attachment | gazette | amendment | source-pdf | reconstruction-source |
  envelope`; zu jedem Objekt ein Umschlag `<schlüssel>.envelope.json` mit URL, Abrufzeit, SHA-256, Typ.
- Unveränderlich: gleicher Schlüssel mit gleichem Hash → `already-present`; anderer Hash → harter Fehler
  (Lauf endet). Nach jedem Upload Rücklesung mit Größen- und Hashprüfung.
- `--archive staging` (Standard, ohne Zugangsdaten): Ablage unter `.cache/recht-nrw-r2-staging/`, später
  `npm run import:recht-nrw:r2-sync -- --write` (gleiche Prüfungen). `--archive r2`: sofortiger Upload
  (S3-API mit `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` oder `wrangler`).
- Quellenreferenz der Norm: `{ availability: "r2-archived", bucket: "landesrecht-quellen", objectKey,
  sha256, url, retrievedAt }`; nie ein Pfad unter `sources/`. Der Bulkmodus bricht ab, wenn das Archiv oder
  das Staging in einem versionierten Verzeichnis läge.

## Zustand im Repository

| Datei | Inhalt |
| --- | --- |
| `data/imports/recht-nrw/enumeration-<bereich>.json` | Enumeration und Fortschritt |
| `data/imports/recht-nrw/manifest/<bereich>/term-<id>.json` | Manifest je Quelle (alle Status) |
| `data/imports/recht-nrw/review/<bereich>/term-<id>.json` | Review-Fälle je Quelle mit Entscheidungen |
| `data/imports/recht-nrw/evidence/lrgv/term-<id>.json` | registrierte Belege (Bekanntmachungen) |
| `data/imports/recht-nrw/slug-registry.json` | Slug je Quelle, stabil; Kollision → `<slug>-<term>` |
| `data/imports/recht-nrw/overrides.json` | dokumentierte Abweichungen vom Portal |
| `data/imports/recht-nrw/institution-mapping.json` | Institutionen-Zuordnung |
| `data/imports/recht-nrw/reconstructions/`, `transcriptions/` | geprüfte Rezepte und Transkriptionen |
| `data/audits/recht-nrw/<slug>.json`, `lrgv/`, `lrmb/` | Reports übernommener und Belege nicht übernommener Dokumente |
| `data/audits/recht-nrw/coverage.json`, `COVERAGE.md`, `runs/` | Coverage und Laufberichte |
| `content/norms/west/<slug>/` | übernommene Normen |

Im Laufe des Bulks entstehen einige Tausend kleine JSON-Dateien; Commits je Phase (oder je
`--max-runtime`-Abschnitt) halten Diffs überschaubar.

## Coverage und Audit

- `npm run import:recht-nrw:coverage -- --write`: Basis ist die Enumeration. Anteile beziehen sich immer auf
  die ausgewiesene Basis, offene Einträge werden als `pending` gezählt; es gibt keine 100 %, solange etwas
  offen ist. Abgleich Sitemap ↔ Suchindex ↔ Term ↔ Manifest ↔ Enumeration ↔ Inhalt, veraltete Importe
  (`parserVersion`/`transformerVersion`) mit Regenerationsbefehl.
- `npm run import:recht-nrw:audit`: Manifest ↔ Inhalte ↔ Slug-Registry ↔ Enumeration, Hashes, Reports,
  Rekonstruktionen, Quellpfade (keine Bulk-Norm mit `sources/`-Pfad), Coverage aktuell.
- `npm run import:recht-nrw:search-audit`: Titel, Abkürzung, §/Artikel, Nummernadressen, Typfilter, West
  allein und alle Länder, keine Fixtures, keine Dubletten, FTS-Integrität.
- `npm run import:recht-nrw:reconstruction-queue -- --write`: Rekonstruktionsbedarf mit Priorisierungshilfe.

## D1

Vollprojektion und Remote-Einspielung über SQL-Batches; Folgeläufe inkrementell mit Basisprüfung
(`docs/DEPLOYMENT.md`). Skalierungsnachweis mit 5 000 synthetischen Normen:
`data/audits/recht-nrw/d1-scale.json`. Remote-D1 wird nur manuell mit `--confirm-remote` beschrieben.

## Nachweise vor dem Lauf

- Offline-Simulation mehrerer Tausend Stammnormen mit Abbruch und Resume, Speicher-R2, Determinismus und
  D1-Projektion: `npm run import:recht-nrw:simulate -- --report` → `data/audits/recht-nrw/bulk-simulation.json`.
- Echte Kleinläufe im Dry-run (`--limit 20` je Bereich) ohne Fehler und ohne Sperrantworten.
- `npm run import:recht-nrw:readiness` → `READY`.
