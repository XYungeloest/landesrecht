# Freeze-Readiness des BayWü-Ausgangsrechtsstands

Automatisch erzeugt von `node scripts/baywue-freeze-readiness.ts --write` (Arbeitskopie; Vorher-Stand: Commit `e0727c86d`). Nicht von Hand bearbeiten. Freeze-Semantik wie West/NSH: `docs/SIMULATION_IMPORT.md` 6.1 (nur der reale Ausgangsrechtsstand zum 01.12.2023; Sim-Normen, Sim-Fassungen, Aufhebungen, Verkündungen und additive Historie/Beziehungen bleiben zulässig), Rückwirkung 6.2.

**Status: NOT READY** · Freeze **nicht gesetzt** · Baseline-Fingerabdruck `2f596f6d3bd13e14700102242d3ab6382c8f0ef6aebc488fe8842c03b1438446` · Sim-Quellenstatus getrennt: `SIM SOURCES PARTIAL` (kein Blocker des Ausgangsrechtsstands)

Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist (Integritätsfehler veröffentlichter Normen, veröffentlichter Text nachweislich nicht der Stichtagstext, nicht reproduzierbare Rezepte, Seed-Konflikte, Regressionen). `READY WITH HUMAN REVIEW`: keine technischen Blocker, offene Fälle klassifiziert. `BASELINE READY`: zusätzlich kein offener Fall.

## 1 Übersicht

| Kennzahl | Wert |
| --- | --- |
| Baseline-Normen vorher → jetzt | 1.701 → 1.619 |
| technische Blocker | 1 |
| offene fachliche Entscheidungen | 1 |
| bewusst ausgeschlossene Fälle (resolved-excluded) | 538 |
| offene Fälle vorher → jetzt | 456 → 2 |
| Rekonstruktion nicht möglich (Queue ohne Rezept) | 526 |

## 2 Bestand

| Herkunft der Stichtagsfassung | vorher | jetzt |
| --- | ---: | ---: |
| exakt (heutiger Text = Stichtagstext) | 1.569 | 1.444 |
| rekonstruiert (Rückrechnung, Rundlauf exakt) | 71 | 114 |
| wiederhergestellt aus Verkündungen (heute nicht geführt) | 61 | 61 |

Normen mit Tabellen / Tabellen: 540 / 1.490 · davon durch die Simulation fortgeschrieben: 2 · eigene Sim-Normen: 46.

## 3 Technische Blocker

| Art | Quelle | Slug | Befund |
| --- | --- | --- | --- |
| seed-conflict | `BayStRGVV` | `strgvv-baywue` | Per-Norm-Seed: veröffentlichter heutiger Text, Stichtagsklassifikation amended-after-baseline-portal-date-stale – Stichtagstext nicht belegt; Seed-Verschiebung nur mit Evidenzentscheidung (data/simulation/baywue/strgvv-baseline-seed-decision.md) |

## 4 Offene fachliche Entscheidungen

| Gruppe | Fälle |
| --- | ---: |
| Rekonstruktion: heutiger Text nach dem Stichtag geändert (Paketdatum veraltet), Stichtagsfassung nicht rückrechenbar | 1 |

## 5 Bewusst ausgeschlossen (resolved-excluded)

| ReasonCode | Bedeutung | Fälle | Dokumente |
| --- | --- | ---: | ---: |
| `old-text-missing` | Alttext fehlt (Neufassung, Aufhebung, Streichung ohne alten Wortlaut) | 189 | 189 |
| `command-not-invertible` | Änderungsbefehl nicht sicher umkehrbar | 28 | 28 |
| `source-scan-unreadable` | Befehl bzw. Quelle nicht lesbar (Scan, Textlayer) | 29 | 29 |
| `missing-primary-source` | Primärquelle fehlt (Vorgänger, Stammverkündung, Kette unvollständig) | 44 | 44 |
| `baseline-validity-unresolved` | Stichtagsgeltung bzw. Fassungsfolge nicht belegt | 82 | 82 |
| `structure-ambiguous` | Ziel der Änderung mehrdeutig | 22 | 22 |
| `missing-normative-annex` | normative Anlage nicht rekonstruierbar | 49 | 49 |
| `unsafe-table-structure` | normative Tabelle nicht rekonstruierbar | 8 | 8 |
| `missing-normative-image` | normative Abbildung nicht rekonstruierbar | 4 | 4 |
| `text-unproven-after-baseline` | heutiger Text nach dem Stichtag geändert (Paketdatum veraltet), Stichtagsfassung nicht rückrechenbar | 83 | 83 |

Ausgeschlossene Fälle bleiben mit Begründung in den Review-Shards (auditierbar, nicht offen, bei neuer Evidenz neu zu öffnen). OCR erzeugt keine kanonische Fassung.

## 6 Rekonstruktion

| Zustand | Normen |
| --- | ---: |
| non-invertible-amendment | 241 |
| recipe-ready | 114 |
| missing-base | 62 |
| partial-chain | 50 |
| contradictory | 41 |
| command-unreadable | 32 |
| asset-missing | 27 |
| unsupported-formula | 27 |
| ambiguous-target | 23 |
| effective-date-undetermined | 18 |
| round-trip-failed | 5 |

Rezeptaudit: 114 Rezepte, Vorwärtsprobe 114/114, Quellen 114/114, Wiederherstellung aus der Stammverkündung 28/28.

## 7 Seeds

| Seed | SHA-256 | Quell-Commit | Stand |
| --- | --- | --- | --- |
| `baygvfg-baywue` | `b5e036ad7f5f6051…` | `21bab36ec` | gültig |
| `ftg-baywue` | `149e7be706a018fd…` | `21bab36ec` | gültig |
| `strgvv-baywue` | `89184e10d1638334…` | `21bab36ec` | **Konflikt** |
| `verfassung-des-freistaates-bayern-wuerttemberg` | `b68a7b434129c0f5…` | `21bab36ec` | gültig |

## 8 Sim-blockierte Zielnormen (unresolved source dependencies)

| Sim-Ziel | Quelle | Baseline veröffentlicht | Rekonstruktion | sicher rekonstruierbar | Sim-Ereignisse |
| --- | --- | --- | --- | --- | --- |
| `bayeug-baywue` | BayEUG | nein | partial-chain/chain-commencement-order | nein | 3 (gesperrt/Review) |
| `bayschfg-baywue` | BaySchFG | nein | command-unreadable/chain-block-not-found | nein | 2 (gesperrt/Review) |
| `pag-baywue` | BayPAG | nein | command-unreadable/chain-block-not-found | nein | 2 (gesperrt/Review) |
| `pog-baywue` | BayPOG | nein | non-invertible-amendment/recast | nein | 2 (gesperrt/Review) |
| `gemeindeordnung-baywue` | BayGO | nein | partial-chain/chain-commencement-order | nein | 1 (gesperrt/Review) |
| `abgeordnetengesetz-baywue` | BayAbgG | nein | non-invertible-amendment/repeal-unit | nein | 1 (gesperrt/Review) |
| `bayfag-baywue` | BayFAG | nein | non-invertible-amendment/repeal-unit | nein | 1 (gesperrt/Review) |
| `baystrwg-baywue` | BayStrWG | nein | non-invertible-amendment/recast | nein | 1 (gesperrt/Review) |
| `ago-baywue` | BayAGO | nein | non-invertible-amendment/recast | nein | 1 (gesperrt/Review) |
| `bayoepnvg-baywue` | BayOePNVG | nein | non-invertible-amendment/delete-words | nein | 1 (gesperrt/Review) |
| `grso-baywue` | BayVSO | nein | non-invertible-amendment/recast | nein | 1 (gesperrt/Review) |
| `gso-baywue` | BayGSO | nein | command-unreadable/chain-block-not-found | nein | 1 (gesperrt/Review) |
| `baykibig-baywue` | BayKiBiG | nein | partial-chain/chain-commencement-order | nein | 1 (gesperrt/Review) |

Keine dieser Baselines wird erzwungen. Solange die Stichtagsfassung nicht sicher rückrechenbar ist, bleibt das Sim-Ziel gesperrt (`missing-baseline-target`).

## 9 Gates

| Gate | Ergebnis | Detail |
| --- | --- | --- |
| manifest-content | grün | Manifest 1.619 übernommen = Bestand 1.619 |
| reconstruction-recipes | grün | 114 Rezepte, Vorwärtsprobe 114, Quellen 114, Wiederherstellung 28/28 |
| r2 | grün | verified, 4.884 Objekte, fehlend 0 (2026-09-29) |
| d1-remote | grün | landesrecht-baywue, Stichprobe 30, 0 Abweichungen (2026-09-29) |
| search-audit-full | grün | 1.661 Normen, 85.073 Sucheinheiten |

## 10 Sim-Quellenstatus (getrennt, kein Baseline-Blocker)

Status `SIM SOURCES PARTIAL`: Reihe 1/1 Ausgaben; Reihe 7/7 Ausgaben. Bekannte Lücken: Originalverkündungsblatt der Staatsverfassung 2025, Organisationserlass vom 14.02.2025, Erdbebenhilfegesetz 2026 (nur als Entwurf belegt; kein Baselinefall), fehlende oder unklare Einzelverkündungen und Lücken der Gazette-Reihen (`data/simulation/baywue/completeness.json`).

