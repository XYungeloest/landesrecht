# Freeze-Readiness des NSH-Ausgangsrechtsstands

Automatisch erzeugt von `node scripts/nsh-freeze-readiness.ts --write` (Arbeitskopie; Vorher-Stand: Review-Fälle im Commit `eeeca2cdc`). Nicht von Hand bearbeiten; Freeze-Semantik: `docs/SIMULATION_IMPORT.md` 6.1, Rückwirkung 6.2. Freigabeübersicht: `docs/NSH_BASELINE_HUMAN_APPROVAL.md`.

**Baseline-Status: FROZEN** · Freeze-Commit `eeeca2cdc5596a602db4332e59a4b252df2b8ea0` (Human Approval 2026-09-29, `docs/NSH_BASELINE_FREEZE.md`) · Baseline-Fingerabdruck `1b92d06468585d5d6bbb241b470638939520d96b1b7a7e0fffea514950548cf9` · Bewertung der Restfälle: `READY WITH HUMAN REVIEW` · Sim-Quellenstatus getrennt: `SIM SOURCES PARTIAL` (kein Blocker des Ausgangsrechtsstands)

Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist. `READY WITH HUMAN REVIEW`: keine technischen Blocker, veröffentlichte Baseline konsistent, alle offenen Fälle klassifiziert. `BASELINE READY`: zusätzlich kein offener Fall – jeder Restfall ist übernommen, mit ReasonCode bewusst ausgeschlossen (`resolved-excluded`) oder durch eine Regel abgelöst. Nicht belegbare Inhalte bleiben ausgeschlossen; das ist kein Blocker. Der Freeze selbst wird nur auf ausdrückliche Entscheidung gesetzt.

## 1 Übersicht

| Kennzahl | Wert |
| --- | --- |
| technische Blocker | 0 |
| offene fachliche Entscheidungen | 1 |
| bewusst ausgeschlossene Fälle (resolved-excluded) | 329 |
| davon fehlende Quellen (Anlage, Text, Quellmangel, Zuordnung) | 125 |
| Baseline-Normen im Bestand (übernommen) | 2.672 |
| offene Fälle vorher → jetzt | 1 → 1 |
| seit Basis erledigt: übernommen / ausgeschlossen / durch Regel abgelöst | 0 / 0 / 0 |

## 2 Bestand

| Kennzahl | Wert |
| --- | --- |
| Baseline-Normen (juris, Ausgangsrechtsstand) | 2.672 |
| davon mit Sim-Folgefassungen | 5 |
| per-Norm-Seeds (gelockte Sim-Ziele) | 6 |
| eigene Normen der Simulation (nicht Baseline) | 33 |
| Normen mit Tabellen / Tabellen (Ausgangsfassung) | 306 / 767 |

Normtypen: verwaltungsvorschrift 1.173 · verordnung 949 · gesetz 502 · zustimmungsgesetz 47 · verfassung 1. Herkunft der Stichtagsfassung: heutige Ausgabe (exakt) 2.329 · aus juris-Einzelfassungen 343. Manifest: imported-with-warnings 2.120 · not-at-baseline 1.739 · imported 552 · excluded 476 · needs-review 308. Textintegrität (Vollkorpus): exact 2.898 · normalized 0 · explained 2.297 · review 0 · mismatch 0.

## 3 Offene Fälle nach Kategorie

| Kategorie | vorher | jetzt |
| --- | ---: | ---: |
| institution-mapping | 1 | 1 |

### 3.1 Technische Blocker

keine

### 3.2 Offene fachliche Entscheidungen

| Gruppe | Fälle | Dokumente | Entscheidung | Beispiele |
| --- | ---: | ---: | --- | --- |
| Landesbezeichnung oder Kürzel ohne Regel | 1 | 1 | Transformationsregel festlegen | VVSH-VVSH000002248 |

### 3.3 Nicht sperrend

keine

## 4 Bewusst ausgeschlossen (resolved-excluded)

| ReasonCode | Fälle | Dokumente |
| --- | ---: | ---: |
| `unsafe-table-structure` | 182 | 179 |
| `missing-normative-annex` | 79 | 79 |
| `missing-normative-text` | 18 | 17 |
| `annex-parent-unresolved` | 12 | 12 |
| `baseline-validity-unresolved` | 19 | 19 |
| `source-deficiency` | 16 | 16 |
| `not-at-baseline` | 2 | 2 |
| `baseline-seed-authoritative` | 1 | 1 |

Anlagen-Untergruppen der offenen Fälle: Stammnorm vollständig, nur nichtnormative Anlage fehlt 0 · normative Anlage separat vorhanden 0 · normative Anlage nur als nicht zugängliche PDF-Datei 0 · Zuordnung unklar 0 · Normtext vollständig fehlend 0.

## 5 Gates

| Gate | Ergebnis | Detail |
| --- | --- | --- |
| audit | grün | 7/7 Prüfungen |
| readiness | grün | TECHNICALLY READY |
| search-audit-full | grün | 2.703 Normen, 87.070 Sucheinheiten |
| d1-remote | grün | landesrecht-nsh, Stichprobe 30, 0 Abweichungen (2026-09-29) |
| r2 | grün | 2.672 Einträge, 11.526 Objekte, Konflikte 0 |
| published-integrity | grün | übernommen nur exact oder erklärt; Manifest 2.672 = Bestand 2.672 |
| contradictory-evidence | grün | 0 offen (muss 0 sein) |
| freeze-fingerprint | grün | Freeze-Commit eeeca2cdc559: 2.672 Normen, 1b92d06468585d5d… · Arbeitskopie 2.672 Normen, 1b92d06468585d5d… · dokumentiert 1b92d06468585d5d… |

## 6 Seeds, Ausnahmen, Sim-Quellen

- Baseline-Lock NSH: Referenz-Commit `eeeca2cdc559`, Freeze gesetzt; Seeds: `gdg-nsh`, `laplag-nsh`, `lbo-nsh`, `lkhg-nsh`, `pog-nsh`, `sftg-nsh`. LBO: `data/simulation/nsh/lbo-baseline-seed-decision.md`.
- Freigabeblöcke der Unveränderlichkeit (NSH-Einträge): `21bab36ec` 219 · `7d584576b` 0 · `a7325a736` 22.
- Sim-Quellenstatus `SIM SOURCES PARTIAL`: 2/2 Ausgaben; 1/1 Ausgaben; 2/2 Ausgaben – betrifft die Fortschreibung, nicht den Ausgangsrechtsstand.

