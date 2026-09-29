# NSH-Ausgangsrechtsstand – Baseline-Freeze

Eingefrorener Ausgangsrechtsstand Schleswig-Holstein → Land Niedersachsen-Holstein zum Stichtag 01.12.2023. Das Dokument
beschreibt genau einen Stand, ohne Chronik. Einzelheiten zu den Restfällen stehen in
`docs/NSH_BASELINE_HUMAN_APPROVAL.md` (Freigabeübersicht). Die laufende Prüfung liefert
`docs/NSH_BASELINE_FREEZE_READINESS.md` (`node scripts/nsh-freeze-readiness.ts --write`).

## Freeze-Status

**Baseline-Status: FROZEN** · Sim-Quellenstatus getrennt: **SIM SOURCES PARTIAL**

| Parameter | Wert |
| --- | --- |
| Stichtag | `2023-12-01` (`SIMULATION_BASELINE_DATE`) |
| Freeze-Commit | `eeeca2cdc5596a602db4332e59a4b252df2b8ea0` |
| Baseline-Fingerabdruck | `1b92d06468585d5d6bbb241b470638939520d96b1b7a7e0fffea514950548cf9` |
| Baseline-Normen | 2 672 |
| Stichtagsfassung exakt aus der heutigen juris-Ausgabe | 2 329 |
| Stichtagsfassung aus juris-Einzelfassungen zusammengesetzt | 343 |
| Freigabe | Human Approval vom 2026-09-29 (Freigabe durch den Nutzer auf Grundlage von `docs/NSH_BASELINE_HUMAN_APPROVAL.md`) |
| Lock | `data/simulation/baseline-locks.json` → `jurisdictions.nsh` = `{ "commit": "eeeca2cd…", "freeze": true }` |

Der Fingerabdruck ist der SHA-256 über die sortierte Liste „Pfad SHA-256“ aller
`content/norms/nsh/<slug>/versions/2023-12-01.json` des juris-Bestands (Normen mit Kennung `juris-sh`). Das Lock-Schema
hat kein eigenes Feld dafür. Deshalb steht der Wert hier und in der Lock-Notiz. Das Readiness-Skript vergleicht Freeze-Commit,
Arbeitskopie und dokumentierten Wert (Gate `freeze-fingerprint`).

## Restfälle (nicht Bestandteil des freigegebenen Bestands)

| Klasse | Fälle | Dokumente |
| --- | ---: | ---: |
| `unsafe-table-structure` (Tabellenraster nicht belegt, kein Fallback) | 182 | 179 |
| `missing-normative-annex` (Anlage nur als nicht zugängliche PDF-Datei, keine OCR) | 79 | 79 |
| `missing-normative-text` | 18 | 17 |
| `annex-parent-unresolved` | 12 | 12 |
| `baseline-validity-unresolved` (Geltung am Stichtag nicht belegt) | 19 | 19 |
| `source-deficiency` (Abbildung, leeres Fußnotenzeichen) | 16 | 16 |
| `not-at-baseline` (nach dem Stichtag ausgefertigt, nur rückwirkend: SpielbkAbgV 2025, EFGSH 2024) | 2 | 2 |
| `baseline-seed-authoritative` (LBO: Seed bleibt maßgeblich) | 1 | 1 |

**Offener, nicht sperrender Quellenfall:** `VVSH-VVSH000002248`, die Einführung der DIN 1999-100 von 2008. Er ist nicht
veröffentlicht und nicht Bestandteil des freigegebenen Bestands. Die Landesfassung „DIN 1999-100 Schl.-H.“ ist dort nicht
selbst belegt, und das Verhältnis zur Einführung von 2022 (`VVSH-VVSH000008422`, veröffentlicht) ist ungeklärt. Bei neuer
Evidenz kann der Fall wieder geöffnet werden; eine Aufnahme ist dann eine dokumentierte Freigabe (unten).

**Der NSH-Freeze bestätigt den veröffentlichten Baselinebestand. Bewusst ausgeschlossene oder mangels Evidenz nicht
veröffentlichte Quellenfälle werden dadurch nicht nachträglich als materiell richtig oder vollständig bestätigt.** Auch die
Vollständigkeit historischer Quellen oder der Sim-Verkündungsblätter bestätigt er nicht.

## Per-Norm-Seeds

`gdg-nsh`, `laplag-nsh`, `lbo-nsh`, `lkhg-nsh`, `pog-nsh` und `sftg-nsh` stimmen byteidentisch mit dem Freeze-Commit
überein (Gate G2 im Freeze-Land). Die LBO-Entscheidung steht in `data/simulation/nsh/lbo-baseline-seed-decision.md`.

## Freeze-Regeln

Die 2 672 Ausgangsfassungen zum 01.12.2023 sind unveränderlich. Eine Änderung ist nur als ausdrücklich dokumentierter
Sonderfall zulässig:

1. echter Import- oder Parser-Bug,
2. neue, bessere Primärevidenz,
3. ausdrückliche Human-Review-Entscheidung,
4. notwendige Schema-Migration ohne fachliche Änderung.

Eine solche Änderung braucht einen Freigabeblock in `data/content-immutability-exceptions.json` mit
`baseCommit` = Freeze-Commit: `regenerated` bzw. `removed` für eine bestehende Norm, `added` für eine neu aufzunehmende
Ausgangsfassung. Bei Tabellen gilt zusätzlich `data/content-table-changes.json`. Die Ausgangsfassung einer durch die
Simulation fortgeschriebenen Norm (Seed) lässt sich nicht über einen Freigabeblock ändern, weil Sim-Fassungen sie voraussetzen.
Dafür braucht es eine neue ausdrückliche Freeze- und Seed-Entscheidung.

Sim-Recht bleibt vollständig additiv zulässig: neue Sim-Normen, neue Sim-Fassungen, Änderungen, Aufhebungen, Verkündungen,
additive Historie und Beziehungen (`import:simulation:consolidate`, Gate G3).

## Durchsetzung (fail-closed)

- **Gate G2** (`npm run content:simulation-gates`, Teil von `content:check`): Jede `versions/2023-12-01.json` ist byteidentisch
  mit dem Freeze-Commit, auch bei Normen mit Seed. Eine neue Baseline-Norm nach dem Freeze-Commit ist ein Verstoß
  (Freigabe `added`). Nur Freigabeblöcke zum Freeze-Commit geben etwas frei, ältere Blöcke bleiben als Beleg stehen.
  Seeds müssen dem Freeze-Commit entsprechen.
- **NSH-Bulk** (`node scripts/import-juris-sh.ts bulk`): Mit gesetztem Freeze schreibt er keine übernommene Norm neu, nimmt keine
  zurück und nimmt keine neue auf, außer mit Freigabe zum Freeze-Commit. Jede Abweichung wird als Review-Fall
  `baseline-frozen` bzw. `baseline-frozen-addition` erfasst (technischer Blocker), und der Lauf endet mit Exit 1.
- **Freeze-Readiness** (`node scripts/nsh-freeze-readiness.ts`): Das Gate `freeze-fingerprint` vergleicht Freeze-Commit,
  Arbeitskopie und dokumentierten Fingerabdruck.
- Der Freeze-Commit wird nie automatisch verschoben, auch nicht nach Importläufen. Eine Verschiebung ist eine
  neue ausdrückliche Freeze-Entscheidung.
