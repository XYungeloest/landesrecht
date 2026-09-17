# West-Referenzbaseline

Eingefrorener Referenzstand des Ausgangsimports Nordrhein-Westfalen → Land Westdeutschland. Dieser Stand ist die
technische Referenzimplementierung für weitere Landesimporte (`docs/NEW_JURISDICTION_IMPORT_CHECKLIST.md`).
Keine Chronik: das Dokument beschreibt genau einen Stand; Kennzahlen stammen aus `data/audits/recht-nrw/`
(Coverage, R2-/D1-/Such-Audit) und `data/imports/recht-nrw/`. `npm run import:recht-nrw:readiness` prüft dieses
Dokument auf Vorhandensein und offene Platzhalter.

## Referenzstichtag

| Parameter | Wert |
| --- | --- |
| Rechtsstand (Stichtag) | `2023-12-01` (`SIMULATION_BASELINE_DATE`) |
| Quelle | RECHT.NRW (LRGV, LRMB), Abrufe 2026-09-15T16:47Z – 2026-09-17T06:00Z (Cache `.cache/recht-nrw`, Rohquellen in R2) |
| Enumerationsstand | LRGV `01a3437d3605b071…` / LRMB `9974a7fcb04afe68…` (Fixpoint in je 1 Durchlauf, Prüfdurchlauf unverändert, bestätigt 2026-09-17) |
| Manifest-Wasserzeichen | `2026-09-17T05:59:48.975Z` (9 361 Einträge: LRGV 3 182, LRMB 6 179) |

## Versionen

| Komponente | Version |
| --- | --- |
| Importer (`packages/importers/recht-nrw`) | Git `1424a92c` + Abschlusslauf 2026-09-17 (Freeze-Commit: `PENDING`, siehe „Final Freeze Procedure“) |
| Parser LRGV / LRMB | `recht-nrw-parser/1.2.0` / `recht-nrw-lrmb-parser/1.3.0` (Evidence Pass) |
| Transformer | `recht-nrw-transformer/2.1.0` |
| Legacy-Ausnahmen (`legacy-exceptions.json`) | 21: 5 `deliver-legacy` (LRGV, Textidentität per SHA-256 nachgewiesen), 16 `depublish` (LRMB, ausgeführt und damit im Versionsreport gegenstandslos); Legacy-Ausnahmen maschinell vorbereitet (`automated-review`), redaktionelle Bestätigung ausstehend (`approvalStatus: pending-human-review`, siehe „Human Approval“) |

Parserstände: LRGV 5 begründet veraltet (Legacy), 0 unbegründet; LRMB 0 veraltet (Versionsreport im `audit`).

## Kennzahlen

| Kennzahl | LRGV | LRMB |
| --- | --- | --- |
| Enumerierte Stammnorm-Kandidaten | 3 190 | 6 345 |
| Verarbeitet / am Stichtag geltend | 3 182 / 1 363 | 6 179 / 492 |
| Übernommen (imported + with-warnings) | 1 245 | 237 |
| Review / ausgeschlossen / fehlgeschlagen | 127 / – / 0 | 4 752 / 497 (+643 ohne Abruf) / 0 (20 ohne Stammnorm-Kennung dokumentiert) |
| Nicht am Stichtag geltend | 1 810 | 693 |
| Rekonstruiert / rekonstruktionsbedürftig | – | 1 / 110 (Queue: 10 recipe-ready, 3 likely-reconstructable, 51 uncertain) |

Normen im Bestand `content/norms/west/`: **1 482** (473 Gesetze, 15 Zustimmungsgesetze, 757 Verordnungen, 237 VwV-Familie:
101 Runderlasse, 86 Förderrichtlinien, 30 Richtlinien, 17 Verwaltungsvorschriften, 2 Allgemeine Verwaltungsvorschriften,
1 Durchführungserlass).

Offene Reviewgruppen (Stand Freeze, `data/audits/recht-nrw/REVIEW_SUMMARY.md`; 11 649 offene Fälle über 6 913 Stammnormen,
5 468 mit Blocker):

| Gruppe | Fälle (blockierend) | Stammnormen | Priorität |
| --- | --- | --- | --- |
| LRGV institution-mapping | 2 452 (0) | 1 148 | niedrig (nichtblockierend, gruppierbar) |
| LRMB normativity | 2 365 (2 365) | 2 365 | hoch (Einzelentscheidung Normativität) |
| LRMB historical-gap | 2 259 (2 259) | 2 259 | mittel (kein amtlicher Beleg für Beginn/Fortgeltung) |
| LRMB unknown-structure | 1 524 (612) | 1 149 | mittel (Parserbefunde, Muster gruppiert) |
| LRGV attachment | 725 (0) | 221 | niedrig |
| LRMB metadata-conflict | 552 (486) | 549 | mittel |
| LRMB document-identity | 458 (20) | 458 | niedrig |

## Auditstatus

| Audit | Ergebnis | Report | Stand |
| --- | --- | --- | --- |
| R2 (`audit:r2`) | 0 relevante Abweichungen; 22 712 Objekte (835,9 MiB), 150 Byte-Stichproben + 25 Umschläge ok, 150 historische Vorgängerobjekte behalten | `data/audits/recht-nrw/r2/R2_AUDIT.json` | 2026-09-17T06:13:07Z |
| D1 lokal ↔ remote (`audit:d1-remote`) | 0 Abweichungen, 11 Prüfungen (Zähler, Typen, Byte-Summen, 30-Norm-Stichprobe) | `data/audits/recht-nrw/d1/D1_REMOTE_CHECK.json` | 2026-09-17T06:12:46Z |
| Suche voll (`search-audit --mode full`) | 1 482 Normen, 54 615 Abfragen, 0 Fehler, 544 s | `data/audits/recht-nrw/search/search-audit-full.json` | 2026-09-17T06:13:09Z |
| Golden Set | Recall@10 94,1 %, MRR 0,933, Top-1 100 %, 0 Fehlschläge (and-first, p50 13,5 ms) | `data/audits/recht-nrw/search/golden-results.json` | 2026-09-17T06:13:50Z |
| Readiness | READY WITH PENDING HUMAN APPROVAL (Hinweise: Legacy-Ausnahmen, 21 Freigaben ausstehend, S3-Variablen nicht gesetzt) | `npm run import:recht-nrw:readiness -- --json` | 2026-09-17 |

## Deployment

| Parameter | Wert |
| --- | --- |
| Worker-Version (Cloudflare) | `6dc90725-84f5-4585-9f89-0f36f1b282c6` (`https://landesrecht.xyungeloestlp.workers.dev`) |
| D1 `landesrecht-west` | 1 482 Normen, 28 932 Sucheinheiten, `last_projected_at` 2026-09-17T06:11:51Z (inkrementell) |
| Freeze-Datum | 2026-09-17 |
| Freeze-Commit | `PENDING` (Basis `1424a92c`; wird in Schritt 7 der Final Freeze Procedure eingetragen) |

## Human Approval

Die 21 Legacy-Ausnahmen (`data/imports/recht-nrw/legacy-exceptions.json`, Schema `recht-nrw-legacy-exceptions/1`
mit `approvalStatus`) sind maschinell vorbereitet (`preparedBy: automated-review`); die redaktionelle Bestätigung
durch den Nutzer ist ausstehend. Kein Eintrag trägt einen automatisch gesetzten Freigebenden.

| Gruppe | Anzahl | Status |
| --- | --- | --- |
| `deliver-legacy` (LRGV, Text SHA-256-identisch, nur Struktur) | 5 | `pending-human-review` |
| `depublish` (LRMB, Depublikation ausgeführt, Geltungsbefund Parser 1.3.0) | 16 | `pending-human-review` |
| Summe | 21 | 0 approved · 21 pending · 0 rejected |

Freigabereport: `data/audits/recht-nrw/HUMAN_APPROVAL_WEST.md` (maschinenlesbar `human-approval-west.json`,
erzeugt mit `npm run import:recht-nrw:approval-report -- --write`, deterministisch aus Ausnahmefeldern, Manifest-
Evidenz, Evidence Pass und Review-Shards). Je Fall genau eine Empfehlung (`DELIVER-LEGACY BEIBEHALTEN`,
`DEPUBLIKATION BEIBEHALTEN`, `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH`), Risikoklasse (low/medium/high) und die
Belegklassen (strong/contradictory tragen, supporting ergänzt, insufficient trägt nicht allein). Die Empfehlung
ersetzt die Entscheidung nicht; Fälle mit Risiko `high` verlangen sie ausdrücklich.

Readiness-Semantik: Ausnahmen müssen `pending-human-review` oder `approved` sein (`rejected` = Blocker);
ausstehende Freigaben ergeben **READY WITH PENDING HUMAN APPROVAL** (Hinweis, Exit 0), mit `--require-approval`
(Freeze-Regel) einen Blocker. `npm run import:recht-nrw:approval-status` meldet Exit 0 nur bei vollständiger
Freigabe (2 = ausstehend, 1 = inkonsistent).

## Final Freeze Procedure

Der Freeze ist erst mit dem Commit des Nutzers abgeschlossen; bis dahin bleibt der Freeze-Commit `PENDING`.

1. **Report prüfen:** `npm run import:recht-nrw:approval-report -- --write`, dann
   `data/audits/recht-nrw/HUMAN_APPROVAL_WEST.md` lesen – Übersichtstabelle, je Fall Belege, Kurzprüfung,
   Empfehlung; Fälle mit `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH` zuerst.
2. **Entscheidungen treffen:** je Fall freigeben oder nicht freigeben; Begründung notieren (Primärquelle,
   Datum, Beleg). `rejected` ist nur „nicht freigegeben“ – Folgeaktion (Regeneration, Override, Entfernung der
   Ausnahme) ist eine eigene Entscheidung.
3. **Approval-CLI:** je Fall
   `npm run import:recht-nrw:approval -- --term term:NNNNN --decision approve|reject --reason "…" [--approved-by "…"] --write`
   (ohne `--write` Dry-run; ein Name wird nur mit `--approved-by` eingetragen).
4. **Approval-Check:** `npm run import:recht-nrw:approval-status` → Exit 0
   (`West Human Approval · 21 exceptions · 21 approved · 0 pending · 0 rejected`); Report erneut schreiben
   (`approval-report -- --write`).
5. **Gates:** `npm run check && npm run test && npm run content:check && npm run d1:schema:check && npm run build`,
   `npm run import:recht-nrw:audit`, `npm run import:recht-nrw:readiness -- --require-approval` → `READY`
   (`ls content/norms/west | wc -l` = 1 482, Content-Fingerabdruck unverändert).
6. **Commit:** Nutzer committet Ausnahmen, Reports und Dokumentation (kein Bulk-Schreiblauf, keine
   Contentänderung durch Freigabemetadaten).
7. **SHA eintragen:** Freeze-Commit in „Versionen“ und „Deployment“ dieses Dokuments (`PENDING` ersetzen).
8. **Referenzbasis:** Stand als West Reference Baseline für weitere Landesimporte führen
   (`docs/NEW_JURISDICTION_IMPORT_CHECKLIST.md`); spätere Änderungen an Ausnahmen durchlaufen wieder Schritte 1–7.

## Einschränkungen

- Geltung ohne amtlichen Beleg: 2 259 LRMB-Vorschriften (historical-gap) bleiben Review; 42 Vorschriften mit
  Regelungsgehalt nur in PDF-Anlagen (keine OCR als Quelle); 110 Fälle rekonstruktionsbedürftig (Textstand nach
  Stichtag geändert, kein geprüftes Rezept); VV zur LHO nur vorbereitet (`docs/VV_LHO_TRANSKRIPTIONSPLAN.md`).
- Nicht abgedeckt: Dokumenttypen außerhalb `docs/LEGAL_SCOPE.md` (Bekanntmachungen als Belege, Sitzungs-/
  Tagesordnungsbekanntmachungen ausgeschlossen); 2 365 Normativitätsentscheidungen offen; 1 148 LRGV-Normen mit
  offenen Institutionen-Zuordnungen (Text unverändert, Simulationsorgan leer).
- Struktur/Darstellung (`data/audits/recht-nrw/quality/`): 390 Tabellen ohne Kopfzellen im Blockmodell,
  150 Legacy-Normen mit mehrfach eingebetteten Fußnoten, 384 am Funktionswort abgeschnittene Titel-Slugs,
  8 Abkürzungen mit Landeszusatz „NW“ (amtlich bzw. Eigennamen, Transformregel bewusst nicht erweitert),
  5 Legacy-Normen mit fehlendem Einheitenkennzeichen in der Quelle (Text vollständig).
