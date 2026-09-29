# Freeze-Readiness des BayWü-Ausgangsrechtsstands

Automatisch erzeugt von `node scripts/baywue-freeze-readiness.ts --write` (Arbeitskopie; Vorher-Stand: Commit `018752abc`). Nicht von Hand bearbeiten. Freeze-Semantik wie West/NSH: `docs/SIMULATION_IMPORT.md` 6.1 (nur der reale Ausgangsrechtsstand zum 01.12.2023; Sim-Normen, Sim-Fassungen, Aufhebungen, Verkündungen und additive Historie/Beziehungen bleiben zulässig), Rückwirkung 6.2.

**Baseline-Status: FROZEN** · Freeze-Commit `018752abcd5cba9a4824410277e9dd7bd37698a4` (Human Approval 2026-09-29, `docs/BAYWUE_BASELINE_FREEZE.md`) · Bewertung der Restfälle: `BASELINE READY` · Baseline-Fingerabdruck `07c7fec745054453cb2c333526beb887c626d2d41a16bd642c4a4a480e58a5a2` · Sim-Quellenstatus getrennt: `SIM SOURCES PARTIAL` (kein Blocker des Ausgangsrechtsstands)

Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist (Integritätsfehler veröffentlichter Normen, veröffentlichter Text nachweislich nicht der Stichtagstext, nicht reproduzierbare Rezepte, Seed-Konflikte, Regressionen). `READY WITH HUMAN REVIEW`: keine technischen Blocker, offene Fälle klassifiziert. `BASELINE READY`: zusätzlich kein offener Fall.

## 1 Übersicht

| Kennzahl | Wert |
| --- | --- |
| Baseline-Normen vorher → jetzt | 1.618 → 1.618 |
| technische Blocker | 0 |
| offene fachliche Entscheidungen | 0 |
| bewusst ausgeschlossene Fälle (resolved-excluded) | 539 |
| offene Fälle vorher → jetzt | 0 → 0 |
| Rekonstruktion nicht möglich (Queue ohne Rezept) | 526 |

## 2 Bestand

| Herkunft der Stichtagsfassung | vorher | jetzt |
| --- | ---: | ---: |
| exakt (heutiger Text = Stichtagstext) | 1.443 | 1.443 |
| rekonstruiert (Rückrechnung, Rundlauf exakt) | 114 | 114 |
| wiederhergestellt aus Verkündungen (heute nicht geführt) | 61 | 61 |

Normen mit Tabellen / Tabellen: 540 / 1.490 · davon durch die Simulation fortgeschrieben: 2 · eigene Sim-Normen: 46.

## 3 Technische Blocker

keine

## 4 Offene fachliche Entscheidungen

keine

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
| `text-unproven-after-baseline` | heutiger Text nach dem Stichtag geändert (Paketdatum veraltet), Stichtagsfassung nicht rückrechenbar | 84 | 84 |

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
| manifest-content | grün | Manifest 1.618 übernommen = Bestand 1.618 |
| reconstruction-recipes | grün | 114 Rezepte, Vorwärtsprobe 114, Quellen 114, Wiederherstellung 28/28 |
| r2 | grün | verified, 4.884 Objekte, fehlend 0 (2026-09-29) |
| d1-remote | grün | landesrecht-baywue, Stichprobe 30, 0 Abweichungen (2026-09-29) |
| search-audit-full | grün | 1.661 Normen, 85.054 Sucheinheiten |
| freeze-fingerprint | grün | Freeze-Commit 018752abcd5c: 1.618 Normen, 07c7fec745054453… · Arbeitskopie 1.618 Normen, 07c7fec745054453… · dokumentiert 07c7fec745054453… |

## 10 Post-Stichtags-Änderungen mit veraltetem Paketdatum

Klassifikation 3b (Lauf 18/19) hat 127 früher als „heutiger Text = Stichtagstext“ geführte bzw. geprüfte Normen umgestellt: 42 sicher zurückgerechnet (korrigierte Stichtagsfassung), 1 neu rekonstruiert, 84 zurückgenommen (einschließlich StRGVV). Persistentes Regressionsset mit Evidenzgrund je Norm: `data/audits/bayernrecht/post-baseline-amendment-regression.json` (Test `tests/unit/bayernrecht-freeze-guard.test.ts`).

## 11 StRGVV (Human Decision 2026-09-29: Regel 6.2 strikt)

`strgvv-baywue`: Seed `89184e10d163…` (akzeptiert 2026-09-28) am 2026-09-29 abgelöst – Human Decision 2026-09-29 (Auftrag Lauf 19): Regel 6.2 strikt, keine Ausnahme wie lbo-nsh; Norm aus dem Ausgangsrechtsstand ausgeschlossen (data/simulation/baywue/strgvv-baseline-seed-decision.md). Die Norm ist nicht veröffentlicht; die Sim-Aufhebung vom 13.04.2025 wirkt als Identitäts-/Statusoperation (Rezeptfeld `targetExcluded`, Beziehungen am Sim-Akt).

## 12 Sim-Quellenstatus (getrennt, kein Baseline-Blocker)

Status `SIM SOURCES PARTIAL`: Reihe 1/1 Ausgaben; Reihe 7/7 Ausgaben. Bekannte Lücken: Originalverkündungsblatt der Staatsverfassung 2025, Organisationserlass vom 14.02.2025, Erdbebenhilfegesetz 2026 (nur als Entwurf belegt; kein Baselinefall), fehlende oder unklare Einzelverkündungen und Lücken der Gazette-Reihen (`data/simulation/baywue/completeness.json`).

