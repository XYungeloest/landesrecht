# BayWü-Ausgangsrechtsstand – Baseline-Freeze

Eingefrorener Ausgangsrechtsstand Bayern → Freistaat Bayern-Württemberg zum Stichtag 01.12.2023. Das Dokument beschreibt
genau einen Stand, ohne Chronik. Die Freigabeübersicht mit allen Restfällen steht in `docs/BAYWUE_BASELINE_HUMAN_APPROVAL.md`,
die laufende Prüfung in `docs/BAYWUE_BASELINE_FREEZE_READINESS.md` (`node scripts/baywue-freeze-readiness.ts --write`).

## Freeze-Status

**Baseline-Status: FROZEN** · Sim-Quellenstatus getrennt: **SIM SOURCES PARTIAL**

| Parameter | Wert |
| --- | --- |
| Stichtag | `2023-12-01` (`SIMULATION_BASELINE_DATE`) |
| Freeze-Commit | `018752abcd5cba9a4824410277e9dd7bd37698a4` |
| Baseline-Fingerabdruck | `07c7fec745054453cb2c333526beb887c626d2d41a16bd642c4a4a480e58a5a2` |
| Baseline-Normen | 1 618 |
| exakt (heutiger Text = Stichtagstext) | 1 443 |
| rekonstruiert (Rückrechnung, Rundlauf exakt, 114 Rezepte) | 114 |
| aus Verkündungen wiederhergestellt (heute nicht geführt) | 61 |
| technische Blocker / offene Entscheidungen | 0 / 0 |
| Freigabe | Human Approval vom 2026-09-29 |
| Lock | `data/simulation/baseline-locks.json` → `jurisdictions.baywue` = `{ "commit": "018752ab…", "freeze": true }` |

Der Fingerabdruck ist der SHA-256 über die sortierte Liste „Pfad SHA-256“ aller
`content/norms/baywue/<slug>/versions/2023-12-01.json` der übernommenen Manifesteinträge. Er steht auch in der Lock-Notiz.
Das Readiness-Skript vergleicht Freeze-Commit, Arbeitskopie und dokumentierten Wert (Gate `freeze-fingerprint`).

## Nicht Bestandteil des Freeze: 539 `resolved-excluded`

| ReasonCode | Fälle |
| --- | ---: |
| `old-text-missing` | 189 |
| `text-unproven-after-baseline` (einschließlich StRGVV) | 84 |
| `baseline-validity-unresolved` | 82 |
| `missing-normative-annex` | 49 |
| `missing-primary-source` | 44 |
| `source-scan-unreadable` | 29 |
| `command-not-invertible` | 28 |
| `structure-ambiguous` | 22 |
| `unsafe-table-structure` | 8 |
| `missing-normative-image` | 4 |

Diese Fälle bleiben mit Begründung in den Review-Shards stehen und damit auditierbar. Neue Evidenz kann einen Fall wieder
öffnen. Eine spätere Aufnahme in den eingefrorenen Bestand braucht eine Freigabe `kind: "added"` mit `baseCommit` =
Freeze-Commit in `data/content-immutability-exceptions.json`.

**Der Freeze bestätigt ausschließlich die veröffentlichten und belegten Baselinefassungen. Bewusst ausgeschlossene Normen
mit nicht sicher rekonstruierbarem Wortlaut werden dadurch nicht als vollständig oder materiell richtig bestätigt.** Ebenso
wenig bestätigt er heute nicht mehr geführte Stichtagsnormen ohne Verkündungsbeleg oder die Vollständigkeit der
Sim-Verkündungsblätter.

## StRGVV

Die Entscheidung ist endgültig (Human Decision 2026-09-29, Regel 6.2 strikt):

- keine Baselinefassung veröffentlicht, ReasonCode `text-unproven-after-baseline`;
- kein aktiver Seed; der alte Seed `89184e10…` ist unter `supersededSeeds[]` dokumentiert;
- die Sim-Aufhebung vom 13.04.2025 bleibt als Identitäts-/Statusoperation erhalten (Rezeptfeld `targetExcluded`,
  `repeals`/`replaces` am Akt);
- keine erfundene Gegenrelation an der nicht veröffentlichten Zielnorm.

Belege: `data/simulation/baywue/strgvv-baseline-seed-decision.md`.

## Seeds und Sim-Rezepte

Aktive Seeds: `baygvfg-baywue`, `ftg-baywue`, `verfassung-des-freistaates-bayern-wuerttemberg`. Sie entsprechen
byteidentisch dem Freeze-Commit (Gate G2). Alle 9 BayWü-Sim-Rezepte sind reproduzierbar (Gate G4). Die 13 gesperrten
Sim-Zielnormen (BayEUG, BaySchFG, PAG, POG, GO, BayAbgG, BayFAG, BayStrWG, AGO, BayÖPNVG, GrSO, GSO, BayKiBiG) bleiben
gesperrt, bis neue Primärevidenz vorliegt.

## Freeze-Regeln

Die 1 618 Ausgangsfassungen zum 01.12.2023 sind unveränderlich. Eine Änderung ist nur als dokumentierter Sonderfall
zulässig:

1. Import- oder Parser-Bug,
2. neue, bessere Primärevidenz,
3. ausdrückliche Human-Review-Entscheidung,
4. Schema-Migration ohne unbeabsichtigte fachliche Änderung.

Dazu gehört jeweils ein Freigabeblock mit `baseCommit` = Freeze-Commit: `regenerated`/`removed` für eine bestehende Norm,
`added` für eine neue; bei Tabellen zusätzlich `data/content-table-changes.json`. Die Sim-Fortschreibung bleibt additiv
zulässig: neue Sim-Normen, Sim-Fassungen, Aufhebungen, Verkündungen, Historie, Beziehungen und neue Sim-Rezepte.

## Durchsetzung (fail-closed)

- **Gate G2** (`npm run content:simulation-gates`): Jede `versions/2023-12-01.json` ist byteidentisch mit dem Freeze-Commit.
  Eine neue Baseline-Norm ohne `added`-Freigabe zum Freeze-Commit ist ein Verstoß. Nur Freigaben zum aktuellen Freeze-Commit
  zählen.
- **BayWü-Bulk** (`node scripts/import-bayernrecht.ts bulk`):
  - Er schreibt keine Datei neu, fügt keine Norm hinzu und nimmt keine zurück; auch den Slug legt er nicht still.
  - Jede Abweichung wird als Review-Fall `baseline-frozen` erfasst, der Lauf endet mit Exit 1.
  - Die Entscheidungslogik `freezeDecision` teilt er mit NSH (`packages/importers/common/src/baseline-lock.ts`).
- **Freeze-Commit:** wird nie automatisch verschoben. Ein semantisch gleicher Bulk-Lauf ist im Arbeitsbaum ein No-op:
  Manifeste und Checkpoint bleiben byteidentisch, Laufdaten stehen nur im Laufbericht unter `data/audits/bayernrecht/runs/`.
