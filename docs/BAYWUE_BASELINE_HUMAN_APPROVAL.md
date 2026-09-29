# BayWü-Ausgangsrechtsstand – Freigabeübersicht für den Baseline-Freeze

Automatisch erzeugt von `node scripts/baywue-freeze-readiness.ts --write`. Freeze-Readiness: **BASELINE READY**. Der Freeze ist **nicht gesetzt**; er wird nur auf ausdrückliche Entscheidung gesetzt.

| Kennzahl | Wert |
| --- | ---: |
| Baseline-Normen | 1.618 |
| exakt (heutiger Text = Stichtagstext) | 1.443 |
| rekonstruiert (Rückrechnung, Rundlauf exakt) | 114 |
| wiederhergestellt aus Verkündungen (heute nicht geführt) | 61 |

**Fingerabdruck:** `07c7fec745054453cb2c333526beb887c626d2d41a16bd642c4a4a480e58a5a2` – SHA-256 über die sortierte Liste „Pfad SHA-256“ aller `content/norms/baywue/<slug>/versions/2023-12-01.json` der übernommenen Manifesteinträge (1.618 Dateien).

## Bewusst ausgeschlossen

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

## Offene fachliche Entscheidungen

keine

## Seeds

| Seed | SHA-256 | Quell-Commit | Stand |
| --- | --- | --- | --- |
| `baygvfg-baywue` | `b5e036ad7f5f6051…` | `21bab36ec` | gültig |
| `ftg-baywue` | `149e7be706a018fd…` | `21bab36ec` | gültig |
| `verfassung-des-freistaates-bayern-wuerttemberg` | `b68a7b434129c0f5…` | `21bab36ec` | gültig |

## Korrigierte Post-Stichtags-Fälle

Klassifikation 3b (Lauf 18/19) hat 127 früher als „heutiger Text = Stichtagstext“ geführte bzw. geprüfte Normen umgestellt: 42 sicher zurückgerechnet (korrigierte Stichtagsfassung), 1 neu rekonstruiert, 84 zurückgenommen (einschließlich StRGVV). Persistentes Regressionsset mit Evidenzgrund je Norm: `data/audits/bayernrecht/post-baseline-amendment-regression.json` (Test `tests/unit/bayernrecht-freeze-guard.test.ts`).

## StRGVV-Entscheidung

`strgvv-baywue`: Seed `89184e10d163…` (akzeptiert 2026-09-28) am 2026-09-29 abgelöst – Human Decision 2026-09-29 (Auftrag Lauf 19): Regel 6.2 strikt, keine Ausnahme wie lbo-nsh; Norm aus dem Ausgangsrechtsstand ausgeschlossen (data/simulation/baywue/strgvv-baseline-seed-decision.md). Die Norm ist nicht veröffentlicht; die Sim-Aufhebung vom 13.04.2025 wirkt als Identitäts-/Statusoperation (Rezeptfeld `targetExcluded`, Beziehungen am Sim-Akt).

## Sim-blockierte Zielnormen

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

Sie bleiben ausgeschlossen bzw. gesperrt, bis neue amtliche Evidenz vorliegt; ihr Ausgangswortlaut ist bewusst und nachvollziehbar ausgeschlossen. Der Sim-Rechtsstand bleibt davon getrennt unvollständig.

## Sim-Rezepte

| Zielnorm | Sim-Akt | Wirkdatum | Art |
| --- | --- | --- | --- |
| `staatsverfassung-2025-baywue` | `erstes-gesetz-zur-aenderung-der-staatsverfassung-baywue` | 2026-05-29 | neue Fassung |
| `ftg-baywue` | `feiertagsg-aenderungsg-2026-baywue` | 2026-06-27 | neue Fassung |
| `staatsverfassung-2025-baywue` | `fuenftes-gesetz-zur-aenderung-der-staatsverfassung-baywue` | 2026-08-29 | neue Fassung |
| `staatsverfassung-2025-baywue` | `gesetz-zur-aenderung-der-staatsverfassung-art-24-2026-baywue` | 2026-06-26 | neue Fassung |
| `staatsverfassung-2025-baywue` | `gesetz-zur-aenderung-der-staatsverfassung-art-45-2026-baywue` | 2026-06-27 | neue Fassung |
| `verfassung-des-freistaates-bayern-wuerttemberg` | `staatsverfassung-2025-baywue` | 2025-01-12 | Aufhebung |
| `strgvv-baywue` | `strgvv-2025-baywue` | 2025-04-13 | Aufhebung (Zielfassung ausgeschlossen) |
| `baygvfg-baywue` | `verkehrsinfrastruktur-erhaltg-baywue` | 2026-05-30 | neue Fassung |
| `staatsverfassung-2025-baywue` | `zweites-gesetz-zur-aenderung-der-staatsverfassung-baywue` | 2026-05-29 | neue Fassung |

## Fehlende Quellen

Nicht veröffentlicht mangels belastbarer Quelle: `old-text-missing` 189 · `source-scan-unreadable` 29 · `missing-primary-source` 44 · `missing-normative-annex` 49 · `unsafe-table-structure` 8 · `missing-normative-image` 4; dazu heute nicht mehr geführte Stichtagsnormen ohne elektronische Verkündung (`docs/BAYWUE_BASELINE_ONLY.md`). Sim-Quellenlücken (Originalblatt der Staatsverfassung 2025, Organisationserlass 14.02.2025, Erdbebenhilfegesetz, Gazette-Lücken) sind davon getrennt.

## Was der Freeze nicht bestätigt

**Der Freeze bestätigt ausschließlich die veröffentlichten und belegten Baselinefassungen. Bewusst ausgeschlossene Normen mit nicht sicher rekonstruierbarem Wortlaut werden dadurch nicht als vollständig oder materiell richtig bestätigt.** Ebenso wenig bestätigt er heute nicht mehr geführte Stichtagsnormen ohne Verkündungsbeleg oder die Vollständigkeit der Sim-Verkündungsblätter.

## Entscheidung für den Freeze

Mit der Freigabe gilt: `data/simulation/baseline-locks.json` → `jurisdictions.baywue` = `{ "commit": "<Commit dieses Stands>", "freeze": true }` für den Bestand mit dem Fingerabdruck `07c7fec745054453cb2c333526beb887c626d2d41a16bd642c4a4a480e58a5a2`. Danach ändert sich eine BayWü-Ausgangsfassung nur noch als dokumentierter Sonderfall (Bug, neue Primärevidenz, Human Review, Schema-Migration); der BayWü-Bulk sperrt jede andere Abweichung (`baseline-frozen`, Exit 1). Sim-Fortschreibung bleibt additiv zulässig.

