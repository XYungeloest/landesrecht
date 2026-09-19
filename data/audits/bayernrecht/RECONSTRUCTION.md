# Rückrechnung von Änderungen – BayWü

Stichtag **2023-12-01** · Auswertungsstichtag 2026-09-18 · erzeugt von `npm run import:bayernrecht:reconstruction-queue -- --write` (offline, nur Cache). Methode: `docs/BAYWUE_RECONSTRUCTION.md`. Schlange: `data/imports/bayernrecht/reconstruction-queue.json`. Rezepte: `data/imports/bayernrecht/reconstruction/<documentId>.json`. Quellenregister: `data/imports/bayernrecht/reconstruction-sources.json`. Audit: `data/audits/bayernrecht/reconstruction-audit.json`.

## Kennzahl: vorher / nachher

| | vorher | nachher |
| --- | ---: | ---: |
| Normen `changed-after-baseline` | 519 | 512 |
| sicher zurückgerechnet | 13 | **63** |
| davon einstufig (Rezept v1) | 13 | 52 |
| davon mehrstufig (Rezept v2) | 0 | 11 |
| davon mit Alttext aus der Stammverkündung (`restoration`, `forward-from-publication`) | 0 | 15 |
| `reconstruction-required` | 506 | 449 |

„vorher“: Schlange bayernrecht-reconstruction-queue/1 vor der mehrstufigen Rückrechnung. Jede zurückgerechnete Norm hat in `baseline.json` Methode `reverse-amendment`, Status `active-at-baseline`, keine Blocker.

## Stammverkündung der offenen Normen (Lauf 7)

Alttext für Neufassung, Aufhebung und Streichung ohne Anker kommt aus der Stammverkündung, wenn sie digital und amtlich als HTML vorliegt und die Kette bis zu ihr reicht (`docs/BAYWUE_RECONSTRUCTION.md`, Abschnitt 19). Je offene Norm (`restorationBase` in der Schlange):

| Stammverkündung | offene Normen |
| --- | ---: |
| verfügbar – die Norm scheitert an anderem (Grund in der Schlange) (`available`) | 188 |
| nur PDF-Ausgabe des GVBl. (ohne HTML-Detailseite) (`base-pdf-only`) | 144 |
| keine Stammverkündung (Neubekanntmachung, Fundstelle fehlt oder nicht lesbar) (`base-none`) | 38 |
| nur auf Papier (`base-paper-only`) | 34 |
| HTML nicht sicher umsetzbar (`baseline-only/html.ts`) (`base-unconvertible`) | 16 |
| verfügbar, aber die Kette bis zur Stammfassung ist nicht lückenlos (`available-chain-incomplete`) | 15 |
| Seite gehört nicht zur Norm (`base-mismatch`) | 12 |
| nicht erreicht (Paket fehlt oder unlesbar) (`not-reached`) | 2 |

## Gruppen

Jede Norm hat **genau eine** Gruppe (Vorrang und Regeln: `src/reconstruction/groups.ts`), dazu beliebig viele Gründe (`reasons` in der Schlange). Die Gruppen 1–3 sind die Fälle, deren Befehle grundsätzlich exakt umkehrbar sind; die übrigen sind nach der schwersten zutreffenden Lage eingeordnet.

| # | Gruppe | Normen | zurückgerechnet | offen | häufigste offene Gründe |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | genau 1 Änderung nach dem Stichtag (`single-amendment`) | 65 | 52 | 13 | `unsupported-formula/unrecognized` 3, `ambiguous-target/reverse-location-unresolved` 1, `ambiguous-target/reverse-target-ambiguous` 1, `command-unreadable/location-unreadable` 1 |
| 2 | 2 Änderungen (`two-amendments`) | 13 | 10 | 3 | `ambiguous-target/reverse-location-unresolved` 1, `command-unreadable/location-unreadable` 1, `partial-chain/chain-ledger-unexplained` 1 |
| 3 | 3 oder mehr Änderungen (`three-or-more-amendments`) | 5 | 1 | 4 | `missing-base/prior-source-unavailable` 1, `partial-chain/chain-ledger-unexplained` 1, `unsupported-formula/renumber` 1, `unsupported-formula/unrecognized` 1 |
| 4 | vollständige Neufassung (`full-recast`) | 6 | 0 | 6 | `non-invertible-amendment/recast` 2, `ambiguous-target/reverse-location-unresolved` 1, `command-unreadable/chain-block-not-found` 1, `missing-base/prior-treaty-without-reference` 1 |
| 5 | Anlagenersetzung (`annex-replacement`) | 81 | 0 | 81 | `asset-missing/annex-recast` 27, `non-invertible-amendment/restore-annex-attachment` 11, `command-unreadable/location-unreadable` 7, `non-invertible-amendment/repeal-unit` 5 |
| 6 | Tabellenersetzung (`table-replacement`) | 14 | 0 | 14 | `non-invertible-amendment/recast` 5, `partial-chain/chain-commencement-order` 2, `command-unreadable/chain-block-not-found` 1, `command-unreadable/location-unreadable` 1 |
| 7 | Bildersetzung (`image-replacement`) | 5 | 0 | 5 | `non-invertible-amendment/recast` 2, `command-unreadable/location-unreadable` 1, `non-invertible-amendment/repeal-unit` 1, `non-invertible-amendment/restoration-disagrees` 1 |
| 8 | fehlender Vorgängertext (`missing-predecessor-text`) | 287 | 0 | 287 | `non-invertible-amendment/recast` 65, `non-invertible-amendment/repeal-unit` 42, `non-invertible-amendment/delete-words` 27, `non-invertible-amendment/restore-not-found` 18 |
| 9 | baseline-only predecessor (`baseline-only-predecessor`) | 3 | 0 | 3 | `missing-base/no-post-baseline-event` 3 |
| 10 | contradictory evidence (`contradictory-evidence`) | 33 | 0 | 33 | `contradictory/portal-in-force-mismatch` 16, `contradictory/chain-prior-history-mismatch` 6, `contradictory/chain-history-mismatch` 3, `contradictory/chain-no-post-baseline-amendment` 3 |

## Wo die Normen scheitern

Jede Prüfung zählt nur Normen, die sie erreicht haben; „nicht erreicht“ heißt, eine frühere Prüfung hat die Norm bereits ausgeschlossen.

| Prüfung | bestanden | nicht bestanden | nicht erreicht |
| --- | ---: | ---: | ---: |
| alle genannten Verkündungen verfügbar (Cache, HTML oder PDF-Textlayer) | 491 | 19 | 2 |
| Kette belegt: Vollzitat, Verweise, Register, Verlauf, Fortführungsnachweis, übrige Verkündungen | 390 | 105 | 17 |
| Inkrafttreten je Änderung bestimmt, in Kettenreihenfolge, jüngstes = inkraft | 393 | 15 | 104 |
| Befehlsblock und Orte lesbar | 373 | 20 | 119 |
| jede Klausel mit unterstützter, eindeutig umkehrbarer Formel | 123 | 270 | 119 |
| Orte aufgelöst, Wortlaut eindeutig, Vorwärtsprobe je Änderung exakt | 67 | 56 | 389 |
| Beginn der Stichtagsfassung (≤ Stichtag) mit Kalenderdatum belegt | 63 | 1 | 448 |

## Zustände

| Zustand | Normen | Bedeutung |
| --- | ---: | --- |
| `non-invertible-amendment` | 229 | Befehl nicht umkehrbar (Alttext fehlt) |
| `recipe-ready` | 63 | sicher zurückgerechnet (Rezept, Forward-Replay exakt) |
| `partial-chain` | 46 | Kette nicht vollständig belegt |
| `contradictory` | 33 | Belege widersprechen einander |
| `command-unreadable` | 30 | Befehl nicht auffindbar oder nicht lesbar |
| `asset-missing` | 27 | Anlage oder Abbildung ohne Alttext |
| `ambiguous-target` | 23 | Ort oder Wortlaut nicht eindeutig |
| `unsupported-formula` | 22 | Formel nicht maschinell angewandt |
| `missing-base` | 19 | Quelle fehlt |
| `effective-date-undetermined` | 15 | Inkrafttreten nicht bestimmbar |
| `round-trip-failed` | 5 | Rundlauf gescheitert |

## Maßgebliche Gründe

Je Norm zählt der schwerste Befund (Widerspruch → Quelle fehlt → Befehl unlesbar → Anlage → nicht umkehrbar → Kette → Inkrafttreten → Formel → Mehrdeutigkeit → Rundlauf). Die Kette wird zuerst geprüft; scheitert sie, werden die Befehle nicht mehr angewandt, ihre Formeln aber für Gruppe und Statistik erhoben.

| Zustand / Grund | Normen |
| --- | ---: |
| `non-invertible-amendment/recast` | 78 |
| `recipe-ready/reverse-amendment-verified` | 63 |
| `non-invertible-amendment/repeal-unit` | 48 |
| `non-invertible-amendment/delete-words` | 29 |
| `asset-missing/annex-recast` | 27 |
| `partial-chain/chain-commencement-order` | 21 |
| `command-unreadable/location-unreadable` | 20 |
| `non-invertible-amendment/restore-not-found` | 20 |
| `contradictory/portal-in-force-mismatch` | 16 |
| `non-invertible-amendment/restoration-prior-reverse` | 16 |
| `effective-date-undetermined/commencement-unreadable` | 15 |
| `non-invertible-amendment/restore-annex-attachment` | 12 |
| `unsupported-formula/unrecognized` | 12 |
| `ambiguous-target/reverse-location-unresolved` | 11 |
| `non-invertible-amendment/restoration-disagrees` | 11 |
| `command-unreadable/chain-block-not-found` | 10 |
| `partial-chain/chain-ledger-unexplained` | 10 |
| `non-invertible-amendment/restore-shape` | 9 |
| `unsupported-formula/insert-unit` | 8 |
| `contradictory/chain-prior-history-mismatch` | 6 |
| `missing-base/prior-source-not-on-platform` | 6 |
| `missing-base/prior-treaty-without-reference` | 6 |
| `ambiguous-target/reverse-end-not-determined` | 5 |
| `ambiguous-target/reverse-target-ambiguous` | 4 |
| `missing-base/no-post-baseline-event` | 4 |
| `non-invertible-amendment/restore-new-mismatch` | 4 |
| `partial-chain/chain-other-publication` | 4 |
| `round-trip-failed/reverse-target-not-found` | 4 |
| `contradictory/chain-history-mismatch` | 3 |
| `contradictory/chain-no-post-baseline-amendment` | 3 |
| `missing-base/prior-source-unavailable` | 3 |
| `partial-chain/chain-partially-in-force` | 3 |
| `partial-chain/chain-register-undated` | 3 |
| `contradictory/portal-in-force-lag` | 2 |
| `contradictory/portal-in-force-unexplained` | 2 |
| `partial-chain/chain-delayed-predecessor` | 2 |
| `unsupported-formula/renumber` | 2 |
| `ambiguous-target/forward-target-ambiguous` | 1 |
| `ambiguous-target/reverse-anchor-mismatch` | 1 |
| `ambiguous-target/reverse-sentence-ambiguous` | 1 |
| `contradictory/chain-last-amendment` | 1 |
| `non-invertible-amendment/location-unresolved` | 1 |
| `non-invertible-amendment/restore-no-change` | 1 |
| `partial-chain/baseline-text-in-force-unproven` | 1 |
| `partial-chain/chain-parallel-order` | 1 |
| `partial-chain/chain-split-commencement` | 1 |
| `round-trip-failed/reverse-overlapping-locations` | 1 |

## Änderungsformeln

Erhoben aus allen Befehlsblöcken der Ketten und des Registers; „Klauseln“ zählt jede Formel je Befehl. Eine Norm fällt, sobald **eine** ihrer Klauseln nicht unterstützt ist. Neu unterstützt (je an echten, gekürzten Verkündungsausschnitten unter `tests/fixtures/bayernrecht/` belegt): Satz einfügen/anfügen, Glied einfügen/anfügen, Umnummerierung von Gliedern und Sätzen, „Der Wortlaut wird Satz 1“, Überschrift einfügen, Wort/Angabe am Ende ersetzen oder streichen.

| Formel | Wortlaut (Beispiel) | Klauseln | Normen | bestimmt Alttext | angewandt |
| --- | --- | ---: | ---: | :---: | :---: |
| `replace-words` | „… wird die Angabe „X“ durch die Angabe „Y“ ersetzt“ | 1789 | 266 | ja | ja |
| `recast` | „… wird wie folgt gefasst:“ / „erhält folgende Fassung“ | 811 | 236 | nein | nein |
| `relabel` | „Der bisherige Abs. 3 wird Abs. 4.“ / „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“ (neu) | 604 | 138 | ja | ja |
| `repeal-unit` | „… wird aufgehoben“ / „Satz 5 wird gestrichen“ | 438 | 175 | nein | nein |
| `insert-words` | „… wird nach/vor der Angabe „X“ die Angabe „Y“ eingefügt“ | 419 | 141 | ja | ja |
| `delete-words` | „… wird die Angabe „X“ gestrichen“ (ohne Anker) | 389 | 143 | nein | nein |
| `unrecognized` | nicht erkannt | 357 | 105 | ja | nein |
| `insert-sentence` | „Folgender Satz 2 wird angefügt: „²…““ / „Nach Satz 1 wird folgender Satz 2 eingefügt“ (neu) | 335 | 135 | ja | ja |
| `insert-block` | „Nach Nr. 4 wird folgende Nr. 5 eingefügt: „5. …““ / „Folgender Abs. 3 wird angefügt“ (neu) | 280 | 144 | ja | ja |
| `renumber-sentence` | „Der bisherige Satz 2 wird Satz 3.“ (neu) | 223 | 85 | ja | ja |
| `renumber` | Umnummerierung, die nicht eindeutig lesbar ist | 130 | 48 | ja | nein |
| `insert-unit` | Einfügung eines Glieds, die nicht eindeutig zuzuordnen ist | 125 | 69 | ja | nein |
| `number-sentences` | „Der Wortlaut wird Satz 1.“ (neu) | 56 | 42 | ja | ja |
| `insert-title` | „In § 5 wird folgende Überschrift eingefügt: „…““ (neu) | 45 | 9 | ja | ja |
| `replace-final-punctuation` | „… wird der Punkt am Ende durch … ersetzt“ | 37 | 29 | ja | ja |
| `annex-recast` | „… erhalten die aus dem Anhang ersichtliche Fassung“ | 36 | 35 | nein | nein |
| `unnumber-sentences` | „In Satz 1 wird die Satznummerierung „¹“ gestrichen.“ (Lauf 7) | 30 | 25 | ja | ja |
| `replace-final-words` | „… wird die Angabe „X“ am Ende durch die Angabe „Y“ ersetzt“ (neu) | 29 | 22 | ja | ja |
| `append-words` | „Der Überschrift wird die Angabe „Y“ angefügt“ | 27 | 23 | ja | ja |
| `unnumber-paragraph` | „In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.“ (Lauf 8) | 22 | 22 | ja | ja |
| `replace-by-punctuation` | „… das Wort „oder“ durch ein Komma ersetzt“ (ohne „am Ende“) | 14 | 9 | ja | ja |
| `delete-words-anchored` | „… wird nach/vor der Angabe „X“ die Angabe „Y“ gestrichen“ | 10 | 9 | ja | ja |
| `number-paragraph` | „Der Wortlaut wird Abs. 1.“ (Run 5) | 5 | 5 | ja | ja |
| `container` | „Art. 5 wird wie folgt geändert:“ (Gliederung) | 2 | 2 | ja | nein |

## Quellen

Das Quellenregister führt **882** Verkündungen (877 HTML-Detailseiten, 5 PDF-Ausgaben), davon 106 für ein Rezept entscheidend; Amtlichkeit: `electronic-official` 389, `printed-official` 493. Je Quelle: Adresse, Fundstelle, Verkündungs- und Ausfertigungsdatum, Amtlichkeit, SHA-256, Rolle je Fall, Abschnitt und Wortlaut der Inkrafttretensvorschrift.

Gezielter Abruf (`reconstruction-queue --fetch`, Prüfpunkt `data/imports/bayernrecht/reconstruction-fetch.json`): **857** Netzabrufe (697 Seiten bzw. PDF abgerufen, 160 belegt nicht vorhanden – 404, 0 Fehler), sequenziell über den Adapter-Fetcher mit Cache und identifizierendem User-Agent. Ein Wiederholungslauf mit `--offline` braucht kein Netz.

## Zurückgerechnete Normen

| Norm | Rezept | Änderungen (jüngste zuerst) | in Kraft | Beginn Stichtagsfassung | Schritte | Formeln | Stichtagskörper |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `BayAGBBiG` | v2 | GVBl. 2025 S. 695 ← GVBl. 2024 S. 98 | 2026-01-01 ← 2024-07-01 | 2021-04-01 | 25 | replace-words, insert-words, insert-block, relabel | `46edda4f9986b897` |
| `BayAPO` | v1 | GVBl. 2024 S. 605 | 2025-01-01 | 2023-10-01 | 1 | replace-words | `ca050c225ea27877` |
| `BayAVWaffBeschR` | v1 | GVBl. 2024 S. 562 | 2024-11-30 | 2019-05-01 | 2 | number-paragraph, insert-block | `c9880415f6c41316` |
| `BayAltersGewV` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2019-11-01 | 1 | replace-words | `7acb6cd43bc5de64` |
| `BayArchivGl` | v1 | GVBl. 2026 S. 61 | 2025-12-15 | 2019-05-01 | 7 | append-words, insert-title, replace-words | `58fc106c9f9e3b93` |
| `BayAufbewV` | v1 | GVBl. 2025 S. 178 | 2025-07-01 | 2017-07-01 | 1 | replace-words | `fce1607475039ed3` |
| `BayBauVorlV2008` | v1 | GVBl. 2024 S. 619 | 2025-01-01 | 2021-02-01 | 1 | replace-words | `02559f94ae602e16` |
| `BayBedV` | v1 | GVBl. 2025 S. 246 | 2025-08-01 | 2006-06-01 | 3 | replace-words | `6083643f8290e668` |
| `BayBestG` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2016-09-01 | 4 | replace-words | `4a6494cc2e4d655b` |
| `BayBodenschEntschV` | v1 | GVBl. 2025 S. 39 | 2025-01-01 | 2013-01-01 | 4 | insert-title, replace-words | `adaab1aaf1ddc10b` |
| `BayDVSoSchG_2` | v1 | GVBl. 2026 S. 425 | 2026-08-01 | 2018-01-01 | 1 | replace-words | `982fbcc055684196` |
| `BayDVVwZVG` | v1 | GVBl. 2023 S. 638 | 2024-01-01 | 2018-06-20 | 3 | insert-block, replace-final-punctuation | `e729f47b5a9bfc28` |
| `BayDVWoR` | v2 | GVBl. 2025 S. 717 ← GVBl. 2024 S. 31 | 2025-12-31 ← 2024-02-28 | 2023-09-01 | 2 | replace-words | `90a3aaf162c20f61` |
| `BayEStBAPO` | v1 | GVBl. 2024 S. 278 | 2024-08-01 | 2023-11-16 | 4 | insert-block, relabel | `a8031000a44c5af0` |
| `BayFEV` | v2 | GVBl. 2025 S. 657 ← GVBl. 2024 S. 632 ← GVBl. 2024 S. 390 | 2025-12-31 ← 2024-12-31 ← 2024-09-29 | 2020-04-20 | 3 | replace-words | `2f6bdb3b66d84563` |
| `BayFGV` | v2 | GVBl. 2024 S. 332 ← GVBl. 2024 S. 229 | 2024-09-01 ← 2024-07-16 | 2023-01-01 | 6 | insert-block, relabel | `9de19ce8376069e1` |
| `BayFachVUVAD` | v1 | GVBl. 2025 S. 127 | 2025-06-01 | 2023-02-01 | 4 | insert-words, insert-block, relabel | `ce31cbb349360e65` |
| `BayFoRG` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2019-05-01 | 3 | replace-words | `2a8a3403b0d8a312` |
| `BayHG2019_2020` | v1 | GVBl. 2024 S. 114 | 2024-01-01 | 2020-01-01 | 1 | replace-words | `c77321a4dbe8d1ac` |
| `BayJAVollzG` | v1 | GVBl. 2025 S. 178 | 2025-07-01 | 2022-11-01 | 2 | insert-sentence, replace-words | `ca2ed5799de3d8f9` |
| `BayKJG` | v1 | GVBl. 2026 S. 75 | 2026-04-01 | 2011-08-01 | 4 | repeal-unit, relabel | `97c63b5d6b42bdf0` |
| `BayKRegG` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2023-08-01 | 1 | replace-words | `abf0de6d9437bcc1` |
| `BayKommHVDoppik` | v1 | GVBl. 2024 S. 21 | 2024-02-01 | 2019-05-01 | 2 | replace-final-punctuation, insert-block | `0d7d0a39aa41b820` |
| `BayLFBPO` | v2 | GVBl. 2026 S. 487 ← GVBl. 2024 S. 98 | 2026-09-01 ← 2024-07-01 | 2023-02-01 | 9 | replace-words | `2c0feb344dffe9a0` |
| `BayLGRG` | v2 | GVBl. 2024 S. 205 ← GVBl. 2024 S. 98 | 2024-07-16 ← 2024-07-01 | 2022-06-01 | 5 | replace-final-punctuation, insert-block, replace-words | `9dd3d2eed3bcf981` |
| `BayRKG` | v1 | GVBl. 2025 S. 643 | 2026-01-01 | 2023-07-15 | 3 | insert-words, append-words, replace-words | `05b074723fec3f93` |
| `BayRMRatV` | v1 | GVBl. 2024 S. 334 | 2024-08-15 | 2021-07-01 | 4 | replace-words, insert-sentence, number-sentences | `0ea66a20ee206bcc` |
| `BaySchBQuVO` | v1 | GVBl. 2024 S. 281 | 2024-08-01 | 2018-09-01 | 4 | insert-block, relabel | `b693f31bafb86140` |
| `BaySpielbG` | v1 | GVBl. 2024 S. 573 | 2025-01-01 | 2022-05-01 | 9 | number-sentences, insert-sentence, insert-block, replace-final-punctuation, replace-words, insert-words | `af31a26a3df011f1` |
| `BayTNAV` | v1 | GVBl. 2025 S. 545 | 2025-11-01 | 2021-01-01 | 4 | number-sentences, insert-sentence, recast | `6d3686ed7425456d` |
| `BayUIG` | v2 | GVBl. 2026 S. 113 ← GVBl. 2024 S. 605 | 2026-04-01 ← 2025-01-01 | 2015-12-30 | 4 | number-sentences, insert-sentence | `2ed95b3159725dd7` |
| `BayUStuetzV` | v1 | GVBl. 2025 S. 605 | 2025-12-31 | 2020-12-31 | 4 | replace-words | `905af085dc11b24d` |
| `BayUntVergV` | v1 | GVBl. 2026 S. 425 | 2026-08-01 | 2013-08-01 | 3 | replace-words, insert-words | `18bb1e98bf851ef3` |
| `BayVGTierS` | v2 | GVBl. 2026 S. 108 ← GVBl. 2024 S. 98 | 2026-04-01 ← 2024-07-01 | 2019-05-01 | 3 | insert-block, replace-words | `d4894762c1d03b34` |
| `BayVHBSt` | v1 | GVBl. 2024 S. 155 | 2024-07-01 | 2018-06-30 | 3 | append-words, insert-words, insert-sentence | `2a59ba798685a261` |
| `BayVV_1142_S_13045` | v1 | BayMBl. 2024 Nr. 139 | 2024-03-01 | 2022-06-01 | 3 | replace-words, recast | `b5a95fbb00f30d9f` |
| `BayVV_2032_3_K_12914` | v1 | BayMBl. 2026 Nr. 129 | 2026-04-01 | 2022-04-06 | 8 | replace-words, insert-block, relabel, recast, insert-sentence | `37042b2f02826a64` |
| `BayVV_2174_A_13397` | v1 | BayMBl. 2026 Nr. 268 | 2026-06-24 | 2023-01-01 | 13 | replace-words, insert-words, repeal-unit, relabel, recast | `8f385da11958ed65` |
| `BayVV_2175_4_G_14041` | v1 | BayMBl. 2024 Nr. 279 | 2024-06-27 | 2023-10-05 | 2 | replace-words | `dbc6d22e1d480e4a` |
| `BayVV_2234_1_K_13989` | v1 | BayMBl. 2026 Nr. 286 | 2026-08-01 | 2023-09-01 | 1 | recast | `6889a1bfc47e4445` |
| `BayVV_2235_1_1_5_K_13224` | v1 | BayMBl. 2024 Nr. 442 | 2024-08-01 | 2022-08-01 | 2 | insert-block, relabel | `ce1d0ae2c942aa5e` |
| `BayVV_2236_9_1_K_11147` | v1 | BayMBl. 2025 Nr. 175 | 2025-06-01 | 2020-01-01 | 5 | delete-words, replace-words, recast | `885b07a32c535c1f` |
| `BayVV_2244_F_13266` | v1 | BayMBl. 2025 Nr. 394 | 2025-09-30 | 2023-05-01 | 8 | recast, replace-final-words, repeal-unit, insert-block, replace-words | `a11265efa3db6f5c` |
| `BayVV_320_A_570` | v1 | BayMBl. 2025 Nr. 286 | 2025-08-01 | 2018-11-01 | 15 | replace-words | `549d7f60cf324045` |
| `BayVV_330_A_571` | v1 | BayMBl. 2026 Nr. 225 | 2026-07-01 | 2018-12-01 | 1 | replace-words | `b9247afa1721a7c6` |
| `BayVV_7801_L_10736` | v1 | BayMBl. 2025 Nr. 62 | 2025-01-21 | 2019-12-01 | 1 | recast | `23fe0b167764780e` |
| `BayVV_7801_L_13600` | v1 | BayMBl. 2026 Nr. 183 | 2026-05-01 | 2023-02-01 | 21 | replace-words, insert-words, recast | `7642c1973b46d759` |
| `BayVV_8113_0_A_12472` | v1 | BayMBl. 2024 Nr. 579 | 2024-12-31 | 2021-10-21 | 8 | insert-words, insert-sentence, replace-words, recast | `aaf87c56faea3995` |
| `BayVV_8113_1_A_11725` | v1 | BayMBl. 2023 Nr. 618 | 2023-12-31 | 2021-01-01 | 2 | insert-block, replace-words | `d98a9eab2e7b0334` |
| `BayVertrV` | v2 | GVBl. 2026 S. 146 ← GVBl. 2025 S. 570 | 2026-04-01 ← 2025-12-31 | 2021-12-01 | 15 | replace-words, delete-words, number-sentences, insert-sentence, repeal-unit, relabel, insert-block | `957de7f2d98e21fc` |
| `BayVfV` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2019-11-01 | 1 | replace-words | `6b4046b1cad8c0fc` |
| `BayVwV101445` | v1 | BayMBl. 2026 Nr. 167 | 2026-04-30 | 2020-11-26 | 1 | insert-block | `db65eb6bff0cf11f` |
| `BayVwV319722` | v1 | BayMBl. 2025 Nr. 4 | 2025-01-09 | 2022-10-01 | 3 | insert-block, relabel | `187b881b653ff280` |
| `BayWoBindG` | v1 | GVBl. 2024 S. 265 | 2024-08-01 | 2019-05-01 | 9 | replace-words, insert-words, insert-block, relabel | `3c0f728025384eb5` |
| `BayZAPOhGesD` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2021-01-01 | 1 | replace-words | `40ae9b65bb4eb63b` |
| `BayZEPRV` | v1 | GVBl. 2026 S. 75 | 2026-04-01 | 2015-08-01 | 2 | replace-words, recast | `6db36be23dfd8a9a` |
| `BayZGAusland` | v1 | GVBl. 2024 S. 247 | 2024-08-01 | 2019-05-01 | 2 | insert-block, relabel | `ea34f0048f6c4c87` |
| `BayZLV` | v2 | GVBl. 2025 S. 272 ← GVBl. 2024 S. 281 | 2025-08-01 ← 2024-08-01 | 2019-05-01 | 5 | insert-block, replace-final-words, replace-final-punctuation, insert-words | `e1c4a5c966dbaa5f` |
| `BayZuVSchfw` | v1 | GVBl. 2025 S. 149 | 2025-06-01 | 2018-11-01 | 1 | replace-words | `67396d66ca0d65af` |
| `BayZustVAM` | v1 | GVBl. 2024 S. 98 | 2024-07-01 | 2019-05-01 | 1 | replace-words | `802602d50e319027` |
| `BayZustVBM` | v1 | GVBl. 2024 S. 485 | 2024-11-01 | 2021-01-01 | 1 | recast | `4a4fc3f2c0891a45` |
| `BayZweckVermG` | v1 | GVBl. 2024 S. 585 | 2024-12-17 | 2019-05-01 | 5 | insert-title, insert-sentence | `d8e7336a5c68b600` |
| `BayeAktVArbSozG` | v2 | GVBl. 2026 S. 75 ← GVBl. 2025 S. 461 | 2026-04-01 ← 2026-01-01 | 2023-05-17 | 5 | recast, delete-words, unnumber-paragraph, repeal-unit | `1a9d6e7c71152be1` |

### BayAGBBiG

- Änderung GVBl. 2025 S. 695 (https://www.verkuendung-bayern.de/gvbl/2025-695/, SHA-256 `0eacaabd1d04fa2e…`), verkündet 2025-12-30, in Kraft 2026-01-01 („Dieses Gesetz tritt am 1. Januar 2026 in Kraft.“)
  - a1-s01 `replace-words` in Art. 1 Abs. 1 Satz 1: „In Abs. 1 Satz 1 wird die Angabe „und“ durch die Angabe „ , “ ersetzt und nach der Angabe „der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG)“ wird die Angabe „und der Feststellung einer individuellen beruflichen Handlungsfähigkeit (§ 1 Abs. 6 BBiG)“ eingefügt.“
    - Stichtag: „…ufsausbildung (§ 1 Abs. 3 des Berufsbildungsgesetzes – BBiG) und der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG) oblieg…“ · heute: „…ufsausbildung (§ 1 Abs. 3 des Berufsbildungsgesetzes – BBiG), der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG) oblieg…“
  - a1-s02 `insert-words` in Art. 1 Abs. 1 Satz 1: „In Abs. 1 Satz 1 wird die Angabe „und“ durch die Angabe „ , “ ersetzt und nach der Angabe „der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG)“ wird die Angabe „und der Feststellung einer individuellen beruflichen Handlungsfähigkeit (§ 1 Abs. 6 BBiG)“ eingefügt.“
    - Stichtag: „…– BBiG), der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG) obliegen den Staatsministerien innerhalb ihres Geschäftsber…“ · heute: „…– BBiG), der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG) und der Feststellung einer individuellen beruflichen Handlungsfähigkeit (§ 1 Abs. 6 BBiG) obliegen den Staatsministerien innerhalb ihres Geschäftsber…“
  - a1-s03 `replace-words` in Art. 1 Abs. 4: „In Abs. 4 wird die Angabe „Berufsausbildung und“ durch die Angabe „Berufsausbildung,“ ersetzt und nach der Angabe „Berufsausbildungsvorbereitung“ wird die Angabe „und der Feststellung der individuellen beruflichen Handlungsfähigkeit“ eingefügt.“
    - Stichtag: „Die Staatsministerien nehmen auch die Aufgaben der Berufsausbildung und der Berufsausbildungsvorbereitung sowie ab…“ · heute: „Die Staatsministerien nehmen auch die Aufgaben der Berufsausbildung, der Berufsausbildungsvorbereitung sowie ab…“
  - a1-s04 `insert-words` in Art. 1 Abs. 4: „In Abs. 4 wird die Angabe „Berufsausbildung und“ durch die Angabe „Berufsausbildung,“ ersetzt und nach der Angabe „Berufsausbildungsvorbereitung“ wird die Angabe „und der Feststellung der individuellen beruflichen Handlungsfähigkeit“ eingefügt.“
    - Stichtag: „…aben der Berufsausbildung, der Berufsausbildungsvorbereitung sowie abweichend von den Abs. 2 und 3 die Aufgaben der beru…“ · heute: „…aben der Berufsausbildung, der Berufsausbildungsvorbereitung und der Feststellung der individuellen beruflichen Handlungsfähigkeit sowie abweichend von den Abs. 2 und 3 die Aufgaben der beru…“
  - a1-s05 `insert-words` in Art. 1 Abs. 5: „In Abs. 5 wird nach der Angabe „Berufsausbildung“ die Angabe „ , der Feststellung der individuellen beruflichen Handlungsfähigkeit“ eingefügt.“
    - Stichtag: „In grundsätzlichen Angelegenheiten der Berufsausbildung und der beruflichen Fortbildung nach Abs. 1 und 2 Satz 1 Bu…“ · heute: „In grundsätzlichen Angelegenheiten der Berufsausbildung, der Feststellung der individuellen beruflichen Handlungsfähigkeit und der beruflichen Fortbildung nach Abs. 1 und 2 Satz 1 Bu…“
  - a1-s06 `insert-block` in Art. 1 Abs. 6: „Folgender Abs. 6 wird angefügt: „(6) Für Angelegenheiten der Feststellung der individuellen beruflichen Handlungsfähigkeit gilt Art. 8 Abs. 2 des Bayerischen Berufsqualifikationsfeststellungsgesetzes (BayBQFG) entsprechend.““
    - Stichtag: „(Glied fehlt)“ · heute: „(6) Für Angelegenheiten der Feststellung der individuellen beruflichen Handlungsfähigkeit gilt Art. 8 Abs. 2 des Bayerischen Berufsqualifikationsfeststellungsgesetzes (BayBQFG) entsprechend.“
  - a1-s07 `insert-block` in Art. 2 Abs. 1 Buchst. b: „Nach Buchst. a wird folgender Buchst. b eingefügt: „b) die Genehmigung der Regelungen für das Verfahren zur Feststellung und Bescheinigung der individuell erworbenen beruflichen Handlungsfähigkeit (§ 50c Abs. 4 BBiG und § 41c Abs. 4 der Handwerksordnung);“.“
    - Stichtag: „(Glied fehlt)“ · heute: „b) die Genehmigung der Regelungen für das Verfahren zur Feststellung und Bescheinigung der individuell erworbenen beruflichen Handlungsfähigkeit (§ 50c Abs. 4 BBiG und § 41c Abs. 4 der Handwerksordnun“
  - a1-s08 `relabel` in Art. 2 Abs. 1 Buchst. b → Buchst. c: „Der bisherige Buchst. b wird Buchst. c und nach der Angabe „§ 62 Abs. 3“ wird die Angabe „ , § 76 Abs. 1“ und nach der Angabe „§ 34 Abs. 9“ wird die Angabe „ , § 41a Abs. 1“ eingefügt.“
    - Stichtag: „b)“ · heute: „c)“
  - a1-s09 `insert-words` in Art. 2 Abs. 1 Buchst. c: „Der bisherige Buchst. b wird Buchst. c und nach der Angabe „§ 62 Abs. 3“ wird die Angabe „ , § 76 Abs. 1“ und nach der Angabe „§ 34 Abs. 9“ wird die Angabe „ , § 41a Abs. 1“ eingefügt.“
    - Stichtag: „…enden Entschädigungen (§ 40 Abs. 6, § 56 Abs. 1, § 62 Abs. 3, § 77 Abs. 3 und § 80 BBiG; § 34 Abs. 9, § 42h Abs. 1, § 42…“ · heute: „…enden Entschädigungen (§ 40 Abs. 6, § 56 Abs. 1, § 62 Abs. 3, § 76 Abs. 1, § 77 Abs. 3 und § 80 BBiG; § 34 Abs. 9, § 42h Abs. 1, § 42…“
  - a1-s10 `insert-words` in Art. 2 Abs. 1 Buchst. c: „Der bisherige Buchst. b wird Buchst. c und nach der Angabe „§ 62 Abs. 3“ wird die Angabe „ , § 76 Abs. 1“ und nach der Angabe „§ 34 Abs. 9“ wird die Angabe „ , § 41a Abs. 1“ eingefügt.“
    - Stichtag: „… Abs. 3, § 76 Abs. 1, § 77 Abs. 3 und § 80 BBiG; § 34 Abs. 9, § 42h Abs. 1, § 42n Abs. 3, § 43 Abs. 3 und § 44b der Hand…“ · heute: „… Abs. 3, § 76 Abs. 1, § 77 Abs. 3 und § 80 BBiG; § 34 Abs. 9, § 41a Abs. 1, § 42h Abs. 1, § 42n Abs. 3, § 43 Abs. 3 und § 44b der Hand…“
  - a1-s11 `relabel` in Art. 2 Abs. 1 Buchst. c → Buchst. d: „Der bisherige Buchst. c wird Buchst. d.“
    - Stichtag: „c)“ · heute: „d)“
  - a1-s12 `relabel` in Art. 2 Abs. 1 Buchst. e → Buchst. f: „Die bisherigen Buchst. d und e werden die Buchst. e und f.“
    - Stichtag: „e)“ · heute: „f)“
  - a1-s13 `relabel` in Art. 2 Abs. 1 Buchst. d → Buchst. e: „Die bisherigen Buchst. d und e werden die Buchst. e und f.“
    - Stichtag: „d)“ · heute: „e)“
  - a1-s14 `relabel` in Art. 2 Abs. 1 Buchst. f → Buchst. g: „Der bisherige Buchst. f wird Buchst. g und nach der Angabe „§ 71 Abs. 9 BBiG“ wird die Angabe „ , auch bei zuständigen Stellen nach § 75b BBiG“ eingefügt.“
    - Stichtag: „f)“ · heute: „g)“
  - a1-s15 `insert-words` in Art. 2 Abs. 1 Buchst. g: „Der bisherige Buchst. f wird Buchst. g und nach der Angabe „§ 71 Abs. 9 BBiG“ wird die Angabe „ , auch bei zuständigen Stellen nach § 75b BBiG“ eingefügt.“
    - Stichtag: „…einbarung zwischen zuständigen Stellen nach § 71 Abs. 9 BBiG.“ · heute: „…einbarung zwischen zuständigen Stellen nach § 71 Abs. 9 BBiG, auch bei zuständigen Stellen nach § 75b BBiG.“
  - a1-s16 `replace-words` in Art. 2 Abs. 2: „In Abs. 2 werden die Angabe „In den Fällen des Abs. 1 Buchst. a und b“ durch die Angabe „In den Fällen des Abs. 1 Buchst. a, b und c“ und die Angabe „im Fall des Abs. 1 Buchst. d“ durch die Angabe „im Fall des Abs. 1 Buchst. e“ ersetzt.“
    - Stichtag: „In den Fällen des Abs. 1 Buchst. a und b ist mit Ausnahme de…“ · heute: „In den Fällen des Abs. 1 Buchst. a, b und c ist mit Ausnahme de…“
  - a1-s17 `replace-words` in Art. 2 Abs. 2: „In Abs. 2 werden die Angabe „In den Fällen des Abs. 1 Buchst. a und b“ durch die Angabe „In den Fällen des Abs. 1 Buchst. a, b und c“ und die Angabe „im Fall des Abs. 1 Buchst. d“ durch die Angabe „im Fall des Abs. 1 Buchst. e“ ersetzt.“
    - Stichtag: „…en des Staatsministeriums für Familie, Arbeit und Soziales, im Fall des Abs. 1 Buchst. d des Staatsministeriums für Unte…“ · heute: „…en des Staatsministeriums für Familie, Arbeit und Soziales, im Fall des Abs. 1 Buchst. e des Staatsministeriums für Unte…“
  - a1-s18 `replace-words` in Art. 2 Abs. 3: „In Abs. 3 wird die Angabe „Buchst. c und d“ durch die Angabe „Buchst. d und e“ ersetzt.“
    - Stichtag: „Die Zuständigkeit nach Abs. 1 Buchst. c und d kann durch Rechtsverordnung auf eine nachgeo…“ · heute: „Die Zuständigkeit nach Abs. 1 Buchst. d und e kann durch Rechtsverordnung auf eine nachgeo…“
  - a1-s19 `replace-words` in Art. 3 Abs. 1 Buchst. a: „In Buchst. a wird die Angabe „und 42g der Handwerksordnung“ durch die Angabe „und 42l der Handwerksordnung“ ersetzt.“
    - Stichtag: „…mängeln (§ 32 Abs. 2, §§ 33 und 60 BBiG; § 23 Abs. 2, §§ 24 und 42g der Handwerksordnung);“ · heute: „…mängeln (§ 32 Abs. 2, §§ 33 und 60 BBiG; § 23 Abs. 2, §§ 24 und 42l der Handwerksordnung);“
  - a1-s20 `replace-words` in Art. 3 Abs. 1 Buchst. d: „In Buchst. d wird die Angabe „§ 42q der Handwerksordnung“ durch die Angabe „§ 42v der Handwerksordnung“ ersetzt.“
    - Stichtag: „…sagung der Berufsausbildungsvorbereitung (§ 70 Abs. 1 BBiG; § 42q der Handwerksordnung)“ · heute: „…sagung der Berufsausbildungsvorbereitung (§ 70 Abs. 1 BBiG; § 42v der Handwerksordnung)“
  - a1-s21 `replace-words` in Art. 4 Satz 1: „In Art. 4 Satz 1 wird die Angabe „und § 72“ durch die Angabe „ , §§ 72 und 75b“ ersetzt.“
    - Stichtag: „… Landwirtschaft und in der Hauswirtschaft (§ 71 Abs. 3 und 8 und § 72 BBiG) sowie für die Anerkennung von Berufsqualifik…“ · heute: „… Landwirtschaft und in der Hauswirtschaft (§ 71 Abs. 3 und 8, §§ 72 und 75b BBiG) sowie für die Anerkennung von Berufsqualifik…“
  - a1-s22 `insert-words` in Art. 5 Abs. 1 Satz 1: „In Art. 5 Abs. 1 Satz 1 wird nach der Angabe „§ 73 Abs. 2“ die Angabe „und § 75b“ eingefügt.“
    - Stichtag: „…ffentlichen Rechts werden als zuständige Stelle (§ 73 Abs. 2 BBiG) die Staatsministerien innerhalb ihres Geschäftsbereic…“ · heute: „…ffentlichen Rechts werden als zuständige Stelle (§ 73 Abs. 2 und § 75b BBiG) die Staatsministerien innerhalb ihres Geschäftsbereic…“
- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - a2-s01 `replace-words` in Art. 1 Abs. 2 Satz 1 Buchst. b: „In Buchst. b werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…rtschaft dem Staatsministerium für Ernährung, Landwirtschaft und Forsten,“ · heute: „…rtschaft dem Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus,“
  - a2-s02 `replace-words` in Art. 1 Abs. 2 Satz 1 Buchst. d: „In Buchst. d werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…ts- und Veterinärwesens dem Staatsministerium für Gesundheit und Pflege,“ · heute: „…ts- und Veterinärwesens dem Staatsministerium für Gesundheit, Pflege und Prävention,“
  - a2-s03 `replace-words` in Art. 4 Satz 1: „In Art. 4 Satz 1 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „¹Das Staatsministerium für Ernährung, Landwirtschaft und Forsten ist zuständige Stelle für die Berufsbildung in …“ · heute: „¹Das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus ist zuständige Stelle für die Berufsbildung in …“
- Beginn der Stichtagsfassung: 2021-04-01 – Vorangehende Änderung § 1 des Gesetzes vom 24. März 2021 (GVBl. S. 94): „Dieses Gesetz tritt am 1. April 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2021-94/, SHA-256 2466f9467c1b1509…

### BayAPO

- Änderung GVBl. 2024 S. 605 (https://www.verkuendung-bayern.de/gvbl/2024-605/, SHA-256 `4e27735428557fbb…`), verkündet 2024-12-30, in Kraft 2025-01-01 („Dieses Gesetz tritt am 1. Januar 2025 in Kraft.“)
  - s01 `replace-words` in § 31 Abs. 6 Satz 2: „In § 31 Abs. 6 Satz 2 wird die Angabe „Nr. 3“ durch die Angabe „Nr. 2“ ersetzt.“
    - Stichtag: „…elfall zur Durchführung seiner Aufgabe nach Art. 115 Abs. 1 Nr. 3 BayBG erforderlich ist.“ · heute: „…elfall zur Durchführung seiner Aufgabe nach Art. 115 Abs. 1 Nr. 2 BayBG erforderlich ist.“
- Beginn der Stichtagsfassung: 2023-10-01 – Vorangehende Änderung vom 19. September 2023 (GVBl. S. 570) (§ 1): „Diese Verordnung tritt am 1. Oktober 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-570/, SHA-256 daa6d471ef8b64ee…

### BayAVWaffBeschR

- Änderung GVBl. 2024 S. 562 (https://www.verkuendung-bayern.de/gvbl/2024-562/, SHA-256 `548316d56e41ad7d…`), verkündet 2024-11-29, in Kraft 2024-11-30 („Diese Verordnung tritt am 30. November 2024 in Kraft.“)
  - s01 `number-paragraph` in § 4 Abs. 1: „Der Wortlaut wird Abs. 1.“
    - Stichtag: „(Wortlaut ohne Absatzbezeichnung)“ · heute: „(1)“
  - s02 `insert-block` in § 4 Abs. 2: „Folgender Abs. 2 wird angefügt: „(2) Für die Kontrollen aufgrund des § 42c WaffG ist die Polizei im Sinne des Art. 1 des Polizeiaufgabengesetzes zuständig, soweit nicht Bundesbehörden zuständig sind.““
    - Stichtag: „(Glied fehlt)“ · heute: „(2) Für die Kontrollen aufgrund des § 42c WaffG ist die Polizei im Sinne des Art. 1 des Polizeiaufgabengesetzes zuständig, soweit nicht Bundesbehörden zuständig sind.“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 177 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayAltersGewV

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in § 1 Nr. 4 Satzteil vor ersten Spiegelstrich: „In § 1 Nr. 4 Satzteil vor dem ersten Spiegelstrich werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…Bereich des Staatsministeriums für Ernährung, Landwirtschaft und Forsten“ · heute: „…Bereich des Staatsministeriums für Ernährung, Landwirtschaft, Forsten und Tourismus“
- Beginn der Stichtagsfassung: 2019-11-01 – Vorangehende Änderung § 2 der Verordnung vom 1. Oktober 2019 (GVBl. S. 594): „Diese Verordnung tritt am 1. November 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-594/, SHA-256 e5a91a05dea859d8…

### BayArchivGl

- Änderung GVBl. 2026 S. 61 (https://www.verkuendung-bayern.de/gvbl/2026-61/, SHA-256 `88bc1719acf62fd0…`), verkündet 2026-03-16, in Kraft 2025-12-15 („Diese Verordnung tritt mit Wirkung vom 15. Dezember 2025 in Kraft.“)
  - s01 `append-words` in Überschrift der Norm: „Der Überschrift wird die Angabe „(ArchivGlV)“ angefügt.“
    - Stichtag: „Verordnung über die Gliederung der Staatlichen Archive Bayerns“ · heute: „Verordnung über die Gliederung der Staatlichen Archive Bayerns (ArchivGlV)“
  - s02 `insert-title` in § 1: „In § 1 wird folgende Überschrift eingefügt: „Gliederung der Staatlichen Archive Bayerns“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Gliederung der Staatlichen Archive Bayerns“
  - s03 `insert-title` in § 2: „Folgende Überschrift wird eingefügt: „Generaldirektion“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Generaldirektion“
  - s04 `replace-words` in § 2 Abs. 1 Satz 2: „In Abs. 1 Satz 2 wird die Angabe „Würzburg“ durch die Angabe „Kitzingen“ ersetzt.“
    - Stichtag: „… Augsburg, Bamberg, Coburg, Landshut, München, Nürnberg und Würzburg nachgeordnet.“ · heute: „… Augsburg, Bamberg, Coburg, Landshut, München, Nürnberg und Kitzingen nachgeordnet.“
  - s05 `insert-title` in § 3: „Folgende Überschrift wird eingefügt: „Bayerisches Hauptstaatsarchiv und Staatsarchive“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Bayerisches Hauptstaatsarchiv und Staatsarchive“
  - s06 `replace-words` in § 3 Abs. 2: „In Abs. 2 wird die Angabe „Würzburg“ durch die Angabe „Kitzingen“ ersetzt.“
    - Stichtag: „Staatsarchiv Würzburg“ · heute: „Staatsarchiv Kitzingen“
  - s07 `insert-title` in § 4: „In § 4 wird folgende Überschrift eingefügt: „Inkrafttreten“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Inkrafttreten“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 254 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayAufbewV

- Änderung GVBl. 2025 S. 178 (https://www.verkuendung-bayern.de/gvbl/2025-178/, SHA-256 `7266e57baa0782f0…`), verkündet 2025-06-30, in Kraft 2025-07-01 („Dieses Gesetz tritt am 1. Juli 2025 in Kraft.“)
  - s01 `replace-words` in Anlage Teil 1 Abschnitt 6 Unterabschnitt 2 Zeile 821 Spalte 6: „In Teil 1 Abschnitt 6 Unterabschnitt 2 der Anlage Zeile der Kennziffer 821 Spalte 6 wird die Angabe „Art. 202 Abs. 3 Satz 2 BayStVollzG“ durch die Wörter „Art. 202 Abs. 6 Satz 2 bis 4 BayStVollzG“ ersetzt.“
    - Stichtag: „…esonderer Umstände kann (nur) unter den Voraussetzungen des Art. 202 Abs. 3 Satz 2 BayStVollzG, § 184 Abs. 3 Satz 2 StVo…“ · heute: „…esonderer Umstände kann (nur) unter den Voraussetzungen des Art. 202 Abs. 6 Satz 2 bis 4 BayStVollzG, § 184 Abs. 3 Satz 2 StVo…“
- Beginn der Stichtagsfassung: 2017-07-01 – Vorangehende Änderung vom 30. Mai 2017 (GVBl. S. 283): „PDF https://www.verkuendung-bayern.de/files/gvbl/2017/11/gvbl-2017-11.pdf, SHA-256 0c52b3c758f1645661e8b6a4ea0f6b2f7c6598686a83313cafcb0c2d73b72b25 = von der Plattform veröffentlichte Prüfsumme (Ausgabenverzeichnis https://www.verkuendung-bayern.de/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/?volume=2017)“ „Textlayer S. 283–301 (PDF-Seite 7–25): Titelzusatz „300-12-6-J Verordnung zur Änderung der Aufbewahrungsverordnung vom 30. Mai 2017“, Unterschrift „München, den 30. Mai 2017“, einzige Inkrafttretensregel „Diese Verordnung tritt am 1. Juli 2017 in Kraft.““ – https://www.verkuendung-bayern.de/files/gvbl/2017/11/gvbl-2017-11.pdf, SHA-256 0c52b3c758f16456…

### BayBauVorlV2008

- Änderung GVBl. 2024 S. 619 (https://www.verkuendung-bayern.de/gvbl/2024-619/, SHA-256 `3a65bd64362d3f43…`), verkündet 2024-12-30, in Kraft 2025-01-01 („Dieses Gesetz tritt am 1. Januar 2025 in Kraft.“)
  - s01 `replace-words` in § 2 Satz 2 Halbsatz 1: „In § 2 Satz 2 Halbsatz 1 wird die Angabe „Art. 65 Abs. 1“ durch die Angabe „Art. 65 Abs. 2“ ersetzt.“
    - Stichtag: „…gen verlangen, soweit dies zur Beteiligung von Stellen nach Art. 65 Abs. 1 Satz 1 Halbsatz 1 BayBO (Sternverfahren) erfo…“ · heute: „…gen verlangen, soweit dies zur Beteiligung von Stellen nach Art. 65 Abs. 2 Satz 1 Halbsatz 1 BayBO (Sternverfahren) erfo…“
- Beginn der Stichtagsfassung: 2021-02-01 – Vorangehende Änderung § 5 des Gesetzes vom 23. Dezember 2020 (GVBl. S. 663): „Dieses Gesetz tritt am 1. Februar 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-663/, SHA-256 f9384e24b4b0e925…

### BayBedV

- Änderung GVBl. 2025 S. 246 (https://www.verkuendung-bayern.de/gvbl/2025-246/, SHA-256 `abbc6fe25704d6e2…`), verkündet 2025-07-30, in Kraft 2025-08-01 („Dieses Gesetz tritt am 1. August 2025 in Kraft.“)
  - s01 `replace-words` in § 1 Abs. 1 Satzteil vor Nr. 1: „In dem Satzteil vor Nr. 1 wird die Angabe „ArbZG“ durch die Angabe „des Arbeitszeitgesetzes (ArbZG)“ ersetzt.“
    - Stichtag: „…fen Arbeitnehmer an Sonn- und Feiertagen abweichend von § 9 ArbZG in den folgenden Betrieben beschäftigt werden:“ · heute: „…fen Arbeitnehmer an Sonn- und Feiertagen abweichend von § 9 des Arbeitszeitgesetzes (ArbZG) in den folgenden Betrieben beschäftigt werden:“
  - s02 `replace-words` in § 1 Abs. 1 Nr. 1 Buchst. a: „In Nr. 1 Buchst. a wird die Angabe „§ 1 Abs. 1 Nr. 3 der Verordnung über den Verkauf bestimmter Waren an Sonn- und Feiertagen vom 21. Dezember 1957 (BGBl I S. 1881) in der jeweils geltenden Fassung“ durch die Angabe „Art. 3 Abs. 3 Satz 1 Nr. 3 des Bayerischen Ladenschlussgesetzes (BayLadSchlG)“ erse“
    - Stichtag: „…i Stunden außerhalb der zulässigen Ladenöffnungszeiten nach § 1 Abs. 1 Nr. 3 der Verordnung über den Verkauf bestimmter Waren an Sonn- und Feiertagen vom 21. Dezember 1957 (BGBl I S. 1881) in der jeweils …“ · heute: „…i Stunden außerhalb der zulässigen Ladenöffnungszeiten nach Art. 3 Abs. 3 Satz 1 Nr. 3 des Bayerischen Ladenschlussgeset…“
  - s03 `replace-words` in § 1 Abs. 2: „In Abs. 2 wird die Angabe „Absatz 1 Nrn. 6 bis 8 gelten“ durch die Angabe „Abs. 1 Nr. 6 bis 8 gelten“ ersetzt.“
    - Stichtag: „Die Ausnahmen nach Absatz 1 Nrn. 6 bis 8 gelten nicht an den Feiertagen Neujahr, K…“ · heute: „Die Ausnahmen nach Abs. 1 Nr. 6 bis 8 gelten nicht an den Feiertagen Neujahr, K…“
- Beginn der Stichtagsfassung: 2006-06-01 – Vorangehende Änderung § 2 des Gesetzes vom 9. Mai 2006 (GVBl. S. 190): „PDF https://www.verkuendung-bayern.de/files/gvbl/2006/09/gvbl-2006-09.pdf, SHA-256 6570e49e97e58a339b91f74594028819400b5fac87ed797c8df380ab6e1b5a45 = von der Plattform veröffentlichte Prüfsumme (Ausgabenverzeichnis https://www.verkuendung-bayern.de/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/?volume=2006)“ „Textlayer S. 190 (PDF-Seite 2): Titelzusatz „Vo m 9. Mai 2006“, Unterschrift „München, den 9. Mai 2006“, einzige Inkrafttretensregel „Dieses Gesetz tritt am 1. Juni 2006 in Kraft.““ – https://www.verkuendung-bayern.de/files/gvbl/2006/09/gvbl-2006-09.pdf, SHA-256 6570e49e97e58a33…

### BayBestG

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in Art. 3a Abs. 4 Satz 1 Halbsatz 2: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…erungsbezirke, bestimmt das Staatsministerium für Gesundheit und Pflege die zuständige Regierung. ²In den Fällen des Abs…“ · heute: „…erungsbezirke, bestimmt das Staatsministerium für Gesundheit, Pflege und Prävention die zuständige Regierung. ²In den Fällen des Abs…“
  - s02 `replace-words` in Art. 15 Abs. 1: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „Das Staatsministerium für Gesundheit und Pflege wird ermächtigt, durch Rechtsverordnung zu besti…“ · heute: „Das Staatsministerium für Gesundheit, Pflege und Prävention wird ermächtigt, durch Rechtsverordnung zu besti…“
  - s03 `replace-words` in Art. 16 Satzteil vor Nr. 1: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „Das Staatsministerium für Gesundheit und Pflege wird ermächtigt, durch Rechtsverordnungen“ · heute: „Das Staatsministerium für Gesundheit, Pflege und Prävention wird ermächtigt, durch Rechtsverordnungen“
  - s04 `replace-words` in Art. 16 Nr. 1 Satz 2 Satzteil vor Buchst. a: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…Rechtsverordnungen kann das Staatsministerium für Gesundheit und Pflege insbesondere“ · heute: „…Rechtsverordnungen kann das Staatsministerium für Gesundheit, Pflege und Prävention insbesondere“
- Beginn der Stichtagsfassung: 2016-09-01 – Vorangehende Änderung § 1 des Gesetzes vom 2. August 2016 (GVBl. S. 246): „Dieses Gesetz tritt am 1. September 2016 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2016-246/, SHA-256 aa197ad27cf93652…

### BayBodenschEntschV

- Änderung GVBl. 2025 S. 39 (https://www.verkuendung-bayern.de/gvbl/2025-39/, SHA-256 `b2da438597e26bf4…`), verkündet 2025-02-14, in Kraft 2025-01-01 („Diese Verordnung tritt mit Wirkung vom 1. Januar 2025 in Kraft.“)
  - s01 `insert-title` in § 1: „In § 1 wird folgende Überschrift eingefügt: „Entschädigung, Reisekosten“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Entschädigung, Reisekosten“
  - s02 `insert-title` in § 2: „Folgende Überschrift wird eingefügt: „Höhe der Entschädigung, Berechnung“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Höhe der Entschädigung, Berechnung“
  - s03 `replace-words` in § 2 Satz 1: „In Satz 1 wird die Angabe „12,25 €“ durch die Angabe „15,50 €“ ersetzt.“
    - Stichtag: „¹Die Entschädigung für Zeitversäumnis beträgt 12,25 € für jede Stunde der aufgewendeten Zeit. ²Die An- und…“ · heute: „¹Die Entschädigung für Zeitversäumnis beträgt 15,50 € für jede Stunde der aufgewendeten Zeit. ²Die An- und…“
  - s04 `insert-title` in § 3: „In § 3 wird folgende Überschrift eingefügt: „Inkrafttreten“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Inkrafttreten“
- Beginn der Stichtagsfassung: 2013-01-01 – Vorangehende Änderung vom 6. März 2013 (GVBl. S. 164): „Diese Verordnung tritt mit Wirkung vom 1. Januar 2013 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2013-164/, SHA-256 f265a30cb4f0d6a4…

### BayDVSoSchG_2

- Änderung GVBl. 2026 S. 425 (https://www.verkuendung-bayern.de/gvbl/2026-425/, SHA-256 `e6ba532d1b2747b4…`), verkündet 2026-07-30, in Kraft 2026-08-01 („Diese Verordnung tritt am 1. August 2026 in Kraft.“)
  - s01 `replace-words` in § 5 Abs. 3: „In § 5 Abs. 3 wird die Angabe „§ 92 Abs. 2 Satz 1 bis 3“ durch die Angabe „§ 142 Abs. 1 und 3 des Neunten Buches Sozialgesetzbuch (SGB IX)“ ersetzt.“
    - Stichtag: „…ie Befugnisse betreffend die Verpflichtungen Anderer gelten § 92 Abs. 2 Satz 1 bis 3 und die §§ 93 bis 95 SGB XII entspr…“ · heute: „…ie Befugnisse betreffend die Verpflichtungen Anderer gelten § 142 Abs. 1 und 3 des Neunten Buches Sozialgesetzbuch (SGB IX) und die §§ 93 bis 95 SGB XII entspr…“
- Beginn der Stichtagsfassung: 2018-01-01 – Vorangehende Änderung vom 26. Februar 2018 (GVBl. S. 188): „Diese Verordnung tritt mit Wirkung vom 1. Januar 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-188/, SHA-256 678d88116b2964ba…

### BayDVVwZVG

- Änderung GVBl. 2023 S. 638 (https://www.verkuendung-bayern.de/gvbl/2023-638/, SHA-256 `1041591aac3f43be…`), verkündet 2023-12-29, in Kraft 2024-01-01 („Diese Verordnung tritt am 1. Januar 2024 in Kraft.“)
  - s01 `insert-block` in § 3 Nr. 6: „Nach Nr. 5 wird folgende Nr. 6 eingefügt: „6. den Rechtsanwaltskammern München, Nürnberg und Bamberg, soweit diese nicht bereits nach Bundesrecht eine entsprechende Befugnis haben,“.“
    - Stichtag: „(Glied fehlt)“ · heute: „6. den Rechtsanwaltskammern München, Nürnberg und Bamberg, soweit diese nicht bereits nach Bundesrecht eine entsprechende Befugnis haben,“
  - s02 `replace-final-punctuation` in § 3 Nr. 13: „In Nr. 13 wird der Punkt am Ende durch ein Komma ersetzt.“
    - Stichtag: „…Klinikum rechts der Isar der Technischen Universität München.“ · heute: „…Klinikum rechts der Isar der Technischen Universität München,“
  - s03 `insert-block` in § 3 Nr. 14: „Folgende Nr. 14 wird angefügt: „14. den Steuerberaterkammern München und Nürnberg, soweit diese nicht bereits nach Bundesrecht eine entsprechende Befugnis haben oder nach Art. 1 Satz 1 des Gesetzes über die Vollstreckung von Beitrags- und Gebührenforderungen der Steuerberaterkammern befugt sind, die“
    - Stichtag: „(Glied fehlt)“ · heute: „14. den Steuerberaterkammern München und Nürnberg, soweit diese nicht bereits nach Bundesrecht eine entsprechende Befugnis haben oder nach Art. 1 Satz 1 des Gesetzes über die Vollstreckung von Beitrag“
- Beginn der Stichtagsfassung: 2018-06-20 – Vorangehende Änderung vom 5. Juni 2018 (GVBl. S. 397): „Diese Verordnung tritt am 20. Juni 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-397/, SHA-256 578b65ee6f01b83e…

### BayDVWoR

- Änderung GVBl. 2025 S. 717 (https://www.verkuendung-bayern.de/gvbl/2025-717/, SHA-256 `4590c8c48987cd3b…`), verkündet 2025-12-30, in Kraft 2025-12-31 („Diese Verordnung tritt am 31. Dezember 2025 in Kraft.“)
  - a1-s01 `replace-words` in § 6 Satz 2: „In § 6 Satz 2 wird die Angabe „2025“ durch die Angabe „2028“ ersetzt.“
    - Stichtag: „…. Mai 2007 in Kraft. ²§ 5 tritt mit Ablauf des 31. Dezember 2025 außer Kraft.“ · heute: „…. Mai 2007 in Kraft. ²§ 5 tritt mit Ablauf des 31. Dezember 2028 außer Kraft.“
- Änderung GVBl. 2024 S. 31 (https://www.verkuendung-bayern.de/gvbl/2024-31/, SHA-256 `7b984784f5e43b5c…`), verkündet 2024-02-15, in Kraft 2024-02-28 („Diese Verordnung tritt am 28. Februar 2024 in Kraft.“)
  - a2-s01 `replace-words` in § 6 Satz 2: „In § 6 Satz 2 wird die Angabe „28. Februar 2024“ durch die Angabe „31. Dezember 2025“ ersetzt.“
    - Stichtag: „…Wirkung vom 1. Mai 2007 in Kraft. ²§ 5 tritt mit Ablauf des 28. Februar 2024 außer Kraft.“ · heute: „…Wirkung vom 1. Mai 2007 in Kraft. ²§ 5 tritt mit Ablauf des 31. Dezember 2025 außer Kraft.“
- Beginn der Stichtagsfassung: 2023-09-01 – Vorangehende Änderung § 2 der Verordnung vom 1. Juli 2023 (GVBl. S. 508): „Diese Verordnung tritt am 1. September 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-508/, SHA-256 e1dd92d2bf54a76f…

### BayEStBAPO

- Änderung GVBl. 2024 S. 278 (https://www.verkuendung-bayern.de/gvbl/2024-278/, SHA-256 `4b1e9d3bbfa07008…`), verkündet 2024-07-30, in Kraft 2024-08-01 („Diese Verordnung tritt am 1. August 2024 in Kraft.“)
  - s01 `insert-block` in Teil 4: „Nach § 14 wird folgender Teil 4 eingefügt: ‚Teil 4 Zweite-Chance-Verfahren § 15 Voraussetzungen der Durchführung eines Zweite-Chance-Verfahrens Die zuständige Ernennungsbehörde darf mit der Durchführung eines Zweite-Chance-Verfahrens nur unter folgenden Bedingungen beginnen: 1. im besonderen Auswahl“
    - Stichtag: „(Glied fehlt)“ · heute: „Teil 4 Zweite-Chance-Verfahren § 15 Voraussetzungen der Durchführung eines Zweite-Chance-Verfahrens Die zuständige Ernennungsbehörde darf mit der Durchführung eines Zweite-Chance-Verfahrens nur unter “
  - s02 `relabel` in Teil 4 → Teil 5: „Der bisherige Teil 4 wird Teil 5.“
    - Stichtag: „Teil 4“ · heute: „Teil 5“
  - s03 `relabel` in § 16 → § 19: „Die bisherigen §§ 15 und 16 werden die §§ 18 und 19.“
    - Stichtag: „§ 16“ · heute: „§ 19“
  - s04 `relabel` in § 15 → § 18: „Die bisherigen §§ 15 und 16 werden die §§ 18 und 19.“
    - Stichtag: „§ 15“ · heute: „§ 18“
- Beginn der Stichtagsfassung: 2023-11-16 – Vorangehende Änderung vom 27. Oktober 2023 (GVBl. S. 608) (§ 1): „Diese Verordnung tritt am 16. November 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-608/, SHA-256 3e0651d2f1f3050a…

### BayFEV

- Änderung GVBl. 2025 S. 657 (https://www.verkuendung-bayern.de/gvbl/2025-657/, SHA-256 `9042d779a173bbd1…`), verkündet 2025-12-30, in Kraft 2025-12-31 („Abweichend von Satz 1 treten die §§ 3 und 4 am 31. Dezember 2025 in Kraft.“)
  - a1-s01 `replace-words` in § 12 Abs. 2: „In § 12 Abs. 2 wird die Angabe „2025“ durch die Angabe „2027“ ersetzt.“
    - Stichtag: „Diese Verordnung tritt mit Ablauf des 31. Dezember 2025 außer Kraft.“ · heute: „Diese Verordnung tritt mit Ablauf des 31. Dezember 2027 außer Kraft.“
- Änderung GVBl. 2024 S. 632 (https://www.verkuendung-bayern.de/gvbl/2024-632/, SHA-256 `17fede70ed143b24…`), verkündet 2024-12-30, in Kraft 2024-12-31 („Abweichend von Satz 1 treten in Kraft: 2. die §§ 8 und 9 am 31. Dezember 2024.“)
  - a2-s01 `replace-words` in § 12 Abs. 2: „In § 12 Abs. 2 werden die Wörter „am 31. Dezember 2024“ durch die Wörter „mit Ablauf des 31. Dezember 2025“ ersetzt.“
    - Stichtag: „Diese Verordnung tritt am 31. Dezember 2024 außer Kraft.“ · heute: „Diese Verordnung tritt mit Ablauf des 31. Dezember 2025 außer Kraft.“
- Änderung GVBl. 2024 S. 390 (https://www.verkuendung-bayern.de/gvbl/2024-390/, SHA-256 `71de5d84b9b41474…`), verkündet 2024-08-14, in Kraft 2024-09-29 („Diese Verordnung tritt am 29. September 2024 in Kraft.“)
  - a3-s01 `replace-words` in § 12 Abs. 2: „In § 12 Abs. 2 wird die Angabe „30. September 2024“ durch die Angabe „31. Dezember 2024“ ersetzt.“
    - Stichtag: „Diese Verordnung tritt am 30. September 2024 außer Kraft.“ · heute: „Diese Verordnung tritt am 31. Dezember 2024 außer Kraft.“
- Beginn der Stichtagsfassung: 2020-04-20 – Inkrafttretensvorschrift im Stichtagstext, § 12 Inkrafttreten, Außerkrafttreten: „Diese Verordnung tritt mit Wirkung vom 20. April 2020 in Kraft.“ · Außerkrafttreten der Norm erst 2024-09-30, nach dem Stichtag: „Diese Verordnung tritt mit Wirkung vom 20. April 2020 in Kraft. Diese Verordnung tritt am 30. September 2024 außer Kraft“

### BayFGV

- Änderung GVBl. 2024 S. 332 (https://www.verkuendung-bayern.de/gvbl/2024-332/, SHA-256 `deb2e473d8a901af…`), verkündet 2024-08-14, in Kraft 2024-09-01 („Diese Verordnung tritt am 1. September 2024 in Kraft.“)
  - a1-s01 `insert-block` in Teil 4: „Nach Teil 3 wird folgender Teil 4 eingefügt: „Teil 4 Ausführung des Grundbuchbereinigungsgesetzes § 15 Anwendung des § 6 des Grundbuchbereinigungsgesetzes § 6 des Grundbuchbereinigungsgesetzes ist für das Gebiet des Freistaates Bayern anzuwenden.““
    - Stichtag: „(Glied fehlt)“ · heute: „Teil 4 Ausführung des Grundbuchbereinigungsgesetzes § 15 Anwendung des § 6 des Grundbuchbereinigungsgesetzes § 6 des Grundbuchbereinigungsgesetzes ist für das Gebiet des Freistaates Bayern anzuwenden.“
  - a1-s02 `relabel` in Teil 4 → Teil 5: „Der bisherige Teil 4 wird Teil 5.“
    - Stichtag: „Teil 4“ · heute: „Teil 5“
  - a1-s03 `relabel` in § 15 → § 16: „Der bisherige § 15 wird § 16.“
    - Stichtag: „§ 15“ · heute: „§ 16“
- Änderung GVBl. 2024 S. 229 (https://www.verkuendung-bayern.de/gvbl/2024-229/, SHA-256 `9ba695ac12b152be…`), verkündet 2024-07-15, in Kraft 2024-07-16 („Diese Verordnung tritt am 16. Juli 2024 in Kraft.“)
  - a2-s01 `insert-block` in Teil 3: „Nach Teil 2 wird folgender Teil 3 eingefügt: ‚Teil 3 Vorschriften für die Eintragung von Bergwerkseigentum und Fischereirechten im Grundbuch Kapitel 1 Allgemeines § 6 Anzuwendende Vorschriften Für die Einrichtung und Führung des Berggrundbuchs und des Fischereigrundbuchs gelten die Vorschriften der “
    - Stichtag: „(Glied fehlt)“ · heute: „Teil 3 Vorschriften für die Eintragung von Bergwerkseigentum und Fischereirechten im Grundbuch Kapitel 1 Allgemeines § 6 Anzuwendende Vorschriften Für die Einrichtung und Führung des Berggrundbuchs un“
  - a2-s02 `relabel` in Teil 3 → Teil 4: „Der bisherige Teil 3 wird Teil 4.“
    - Stichtag: „Teil 3“ · heute: „Teil 4“
  - a2-s03 `relabel` in § 6 → § 15: „Der bisherige § 6 wird § 15.“
    - Stichtag: „§ 6“ · heute: „§ 15“
- Beginn der Stichtagsfassung: 2023-01-01 – Inkrafttretensvorschrift im Stichtagstext, § 6 Inkrafttreten: „Diese Verordnung tritt am 1. Januar 2023 in Kraft.“

### BayFachVUVAD

- Änderung GVBl. 2025 S. 127 (https://www.verkuendung-bayern.de/gvbl/2025-127/, SHA-256 `45abac531296facd…`), verkündet 2025-05-15, in Kraft 2025-06-01 („Diese Verordnung tritt am 1. Juni 2025 in Kraft.“)
  - s01 `insert-words` in § 3 Abs. 1: „In § 3 Abs. 1 wird nach dem Wort „Leistungslaufbahngesetzes“ die Angabe „(LlbG)“ eingefügt.“
    - Stichtag: „…t sich nach den Art. 38 bis 40 des Leistungslaufbahngesetzes.“ · heute: „…t sich nach den Art. 38 bis 40 des Leistungslaufbahngesetzes (LlbG).“
  - s02 `insert-block` in Teil 3: „Nach § 3 wird folgender Teil 3 eingefügt: ‚Teil 3 Zweite-Chance-Verfahren § 4 Voraussetzungen der Durchführung eines Zweite-Chance-Verfahrens Mit der Durchführung eines Zweite-Chance-Verfahrens darf nur unter folgenden Bedingungen begonnen werden: 1. im besonderen Auswahlverfahren für die Fachlaufba“
    - Stichtag: „(Glied fehlt)“ · heute: „Teil 3 Zweite-Chance-Verfahren § 4 Voraussetzungen der Durchführung eines Zweite-Chance-Verfahrens Mit der Durchführung eines Zweite-Chance-Verfahrens darf nur unter folgenden Bedingungen begonnen wer“
  - s03 `relabel` in Teil 3 → Teil 4: „Der bisherige Teil 3 wird Teil 4.“
    - Stichtag: „Teil 3“ · heute: „Teil 4“
  - s04 `relabel` in § 4 → § 7: „Der bisherige § 4 wird § 7.“
    - Stichtag: „§ 4“ · heute: „§ 7“
- Beginn der Stichtagsfassung: 2023-02-01 – Inkrafttretensvorschrift im Stichtagstext, § 4 Inkrafttreten: „Diese Verordnung tritt am 1. Februar 2023 in Kraft.“

### BayFoRG

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in Art. 7 Abs. 3: „In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „Das Staatsministerium für Ernährung, Landwirtschaft und Forsten erläßt im Einvernehmen mit den Staatsministerie…“ · heute: „Das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus erläßt im Einvernehmen mit den Staatsministerie…“
  - s02 `replace-words` in Art. 29 Abs. 3 Satz 1: „In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…t Bayern vom Staatsministerium für Ernährung, Landwirtschaft und Forsten, im übrigen von der einschlägigen Organisation …“ · heute: „…t Bayern vom Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus, im übrigen von der einschlägigen Organisation …“
  - s03 `replace-words` in Art. 51: „In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „Das Staatsministerium für Ernährung, Landwirtschaft und Forsten erläßt im Einvernehmen mit den Staatsministerie…“ · heute: „Das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus erläßt im Einvernehmen mit den Staatsministerie…“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 338 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayHG2019_2020

- Änderung GVBl. 2024 S. 114 (https://www.verkuendung-bayern.de/gvbl/2024-114/, SHA-256 `c13f316994452091…`), verkündet 2024-06-28, in Kraft 2024-01-01 („Dieses Gesetz tritt mit Wirkung vom 1. Januar 2024 in Kraft.“)
  - s01 `replace-words` in Art. 18 Abs. 5: „In Art. 18 Abs. 5 wird die Angabe „31. Dezember 2043“ durch die Angabe „31. Dezember 2023“ ersetzt.“
    - Stichtag: „Art. 2a Abs. 2 tritt mit Ablauf des 31. Dezember 2043 außer Kraft.“ · heute: „Art. 2a Abs. 2 tritt mit Ablauf des 31. Dezember 2023 außer Kraft.“
- Beginn der Stichtagsfassung: 2020-01-01 – Vorangehende Änderung § 1 des Gesetzes vom 27. April 2020 (GVBl. S. 238): „Dieses Gesetz tritt mit Wirkung vom 1. Januar 2020 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-238/, SHA-256 3a02863da5e3f2ea…

### BayJAVollzG

- Änderung GVBl. 2025 S. 178 (https://www.verkuendung-bayern.de/gvbl/2025-178/, SHA-256 `7266e57baa0782f0…`), verkündet 2025-06-30, in Kraft 2025-07-01 („Dieses Gesetz tritt am 1. Juli 2025 in Kraft.“)
  - s01 `insert-sentence` in Art. 8: „Dem Art. 8 wird folgender Satz 3 angefügt: „³Art. 166 Abs. 4 BayStVollzG gilt entsprechend.““
    - Stichtag: „(Satz fehlt)“ · heute: „³Art. 166 Abs. 4 BayStVollzG gilt entsprechend.“
  - s02 `replace-words` in Art. 19 Abs. 2 Satz 3: „In Art. 19 Abs. 2 Satz 3 wird die Angabe „Art. 91 Abs. 1 Satz 2 und 3“ durch die Angabe „Art. 91 Abs. 1 Satz 2 bis 4“ ersetzt.“
    - Stichtag: „…. ³Bei der Durchsuchung von Besuchern sind die Vorgaben des Art. 91 Abs. 1 Satz 2 und 3 BayStVollzG einzuhalten.“ · heute: „…. ³Bei der Durchsuchung von Besuchern sind die Vorgaben des Art. 91 Abs. 1 Satz 2 bis 4 BayStVollzG einzuhalten.“
- Beginn der Stichtagsfassung: 2022-11-01 – Vorangehende Änderung § 3 des Gesetzes vom 21. Oktober 2022 (GVBl. S. 642): „Dieses Gesetz tritt am 1. November 2022 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2022-642/, SHA-256 25334aa44d7afb8a…

### BayKJG

- Änderung GVBl. 2026 S. 75 (https://www.verkuendung-bayern.de/gvbl/2026-75/, SHA-256 `97a4022d212061fa…`), verkündet 2026-03-31, in Kraft 2026-04-01 („Dieses Gesetz tritt am 1. April 2026 in Kraft.“)
  - s01 `repeal-unit` in Art. 4 Nr. 1: „Nr. 1 wird aufgehoben.“
    - Stichtag: „1. Anlagen im Sinn von Art. 2 Abs. 1 der Bayerischen Bauordnung im Freien nach dem Stand der Technik zur Lärmminderung zu errichten und zu betreiben,“ · heute: „(aufgehoben)“
  - s02 `relabel` in Art. 4 Nr. 2 → Nr. 1: „Die Nrn. 2 bis 4 werden die Nrn. 1 bis 3.“
    - Stichtag: „2.“ · heute: „1.“
  - s03 `relabel` in Art. 4 Nr. 3 → Nr. 2: „Die Nrn. 2 bis 4 werden die Nrn. 1 bis 3.“
    - Stichtag: „3.“ · heute: „2.“
  - s04 `relabel` in Art. 4 Nr. 4 → Nr. 3: „Die Nrn. 2 bis 4 werden die Nrn. 1 bis 3.“
    - Stichtag: „4.“ · heute: „3.“
- Beginn der Stichtagsfassung: 2011-08-01 – Inkrafttretensvorschrift im Stichtagstext, Art. 8 Inkrafttreten: „Dieses Gesetz tritt am 1. August 2011 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung GVBl. 2011 S. 304 (https://www.verkuendung-bayern.de/gvbl/2011-304/, SHA-256 15165855ce5b6015…); Wortlaut gleich (3379 Zeichen, typografisch vereinheitlicht)

### BayKRegG

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in Art. 13 Abs. 2 Satz 1: „In Art. 13 Abs. 2 Satz 1 werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…en ist eine Zustimmung des Staatsministeriums für Gesundheit und Pflege (Staatsministerium) erforderlich. ²Das Staatsmin…“ · heute: „…en ist eine Zustimmung des Staatsministeriums für Gesundheit, Pflege und Prävention (Staatsministerium) erforderlich. ²Das Staatsmin…“
- Beginn der Stichtagsfassung: 2023-08-01 – Vorangehende Änderung vom 24. Juli 2023 (GVBl. S. 430) (§ 1): „Dieses Gesetz tritt am 1. August 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-430/, SHA-256 912b1084230359e2…

### BayKommHVDoppik

- Änderung GVBl. 2024 S. 21 (https://www.verkuendung-bayern.de/gvbl/2024-21/, SHA-256 `ffa4c2b395a7c107…`), verkündet 2024-01-31, in Kraft 2024-02-01 („Diese Verordnung tritt am 1. Februar 2024 in Kraft.“)
  - s01 `replace-final-punctuation` in § 1 Abs. 3 Nr. 4: „In § 1 Abs. 3 Nr. 4 wird das Komma am Ende durch die Wörter „sowie eine Übersicht über die im Finanzplanungszeitraum gültigen Kreditermächtigungen aus den Vorjahren und deren Inanspruchnahmen,“ ersetzt.“
    - Stichtag: „…ckstellungen und der Rücklagen zu Beginn des Haushaltsjahres,“ · heute: „…ckstellungen und der Rücklagen zu Beginn des Haushaltsjahres sowie eine Übersicht über die im Finanzplanungszeitraum gültigen Kreditermächtigungen aus den Vorjahren und deren Inanspruchnahmen,“
  - s02 `insert-block` in § 99 Abs. 5: „Dem § 99 wird folgender Abs. 5 angefügt: „(5) Auf Haushaltspläne, die der Rechtsaufsichtsbehörde bis zum Ablauf des 31. Januar 2024 vorgelegt werden, ist § 1 Abs. 3 Nr. 4 in der am 31. Januar 2024 geltenden Fassung anzuwenden.““
    - Stichtag: „(Glied fehlt)“ · heute: „(5) Auf Haushaltspläne, die der Rechtsaufsichtsbehörde bis zum Ablauf des 31. Januar 2024 vorgelegt werden, ist § 1 Abs. 3 Nr. 4 in der am 31. Januar 2024 geltenden Fassung anzuwenden.“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 51 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayLFBPO

- Änderung GVBl. 2026 S. 487 (https://www.verkuendung-bayern.de/gvbl/2026-487/, SHA-256 `c2206b934d7970d2…`), verkündet 2026-07-30, in Kraft 2026-09-01 („Diese Verordnung tritt am 1. September 2026 in Kraft.“)
  - a1-s01 `replace-words` in § 4 Abs. 2: „In § 4 Abs. 2 wird die Angabe „den selben“ durch die Angabe „denselben“ ersetzt.“
    - Stichtag: „…i mehreren zuständigen Stellen oder Prüfungsausschüssen mit den selben Prüfungsaufgaben sind einheitliche Prüfungstermine…“ · heute: „…i mehreren zuständigen Stellen oder Prüfungsausschüssen mit denselben Prüfungsaufgaben sind einheitliche Prüfungstermine…“
  - a1-s02 `replace-words` in § 5 Abs. 1 Satz 1: „Die Angabe „schriftlich“ wird durch die Angabe „in Textform“ ersetzt.“
    - Stichtag: „¹Der Antrag auf Zulassung zur Prüfung ist schriftlich unter Verwendung der von der zuständigen Stelle …“ · heute: „¹Der Antrag auf Zulassung zur Prüfung ist in Textform unter Verwendung der von der zuständigen Stelle …“
  - a1-s03 `replace-words` in § 5 Abs. 1 Satz 1: „Die Angabe „Vordrucke“ wird durch die Angabe „Muster“ ersetzt.“
    - Stichtag: „…ung der von der zuständigen Stelle zur Verfügung gestellten Vordrucke innerhalb der festgesetzten Frist zu stellen. ²Mit Ei…“ · heute: „…ung der von der zuständigen Stelle zur Verfügung gestellten Muster innerhalb der festgesetzten Frist zu stellen. ²Mit Ei…“
  - a1-s04 `replace-words` in § 5 Abs. 2 Satz 4: „In Abs. 2 Satz 4 wird die Angabe „Einzelfällen“ durch die Angabe „Fällen“ ersetzt.“
    - Stichtag: „…g festlegen. ⁴Die zuständigen Stellen können in begründeten Einzelfällen von den Festlegungen nach den Sätzen 1 bis 3 abweiche…“ · heute: „…g festlegen. ⁴Die zuständigen Stellen können in begründeten Fällen von den Festlegungen nach den Sätzen 1 bis 3 abweiche…“
  - a1-s05 `replace-words` in § 9 Abs. 1 Satz 1 Halbsatz 1: „In Halbsatz 1 wird die Angabe „schriftliche Erklärung“ durch die Angabe „Erklärung in Textform“ ersetzt.“
    - Stichtag: „…ahrens (§ 5 Abs. 1 Satz 2) bis zum Beginn der Prüfung durch schriftliche Erklärung ohne Angabe von Gründen zurücktreten; …“ · heute: „…ahrens (§ 5 Abs. 1 Satz 2) bis zum Beginn der Prüfung durch Erklärung in Textform ohne Angabe von Gründen zurücktreten; …“
  - a1-s06 `replace-words` in § 9 Abs. 1 Satz 1 Halbsatz 2: „In Halbsatz 2 wird die Angabe „zur Post gegeben“ durch die Angabe „versendet“ ersetzt.“
    - Stichtag: „…der Prüfung ein, muss sie nachweislich vor diesem Zeitpunkt zur Post gegeben worden sein. ²Die Prüfung beginnt mit der Aushändi…“ · heute: „…der Prüfung ein, muss sie nachweislich vor diesem Zeitpunkt versendet worden sein. ²Die Prüfung beginnt mit der Aushändi…“
  - a1-s07 `replace-words` in § 10 Abs. 2 Satz 3: „In § 10 Abs. 2 Satz 3 wird die Angabe „von einander“ durch die Angabe „voneinander“ ersetzt.“
    - Stichtag: „…ichen. ³Weichen die Bewertungen um mehr als eine Notenstufe von einander ab, sollen sich die Prüfer auf eine ganze Note e…“ · heute: „…ichen. ³Weichen die Bewertungen um mehr als eine Notenstufe voneinander ab, sollen sich die Prüfer auf eine ganze Note e…“
- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - a2-s01 `replace-words` in Überschrift der Norm: „In der Überschrift und in § 2 Abs. 5 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „Verordnung über die Durchführung der Prüfungen nach dem Berufsbildungsgesetz im Geschäftsbereich des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten (Prüfungsordnung Berufsbildung – Landwirtschaft und Hauswirtschaft – LHBPO)“ · heute: „Verordnung über die Durchführung der Prüfungen nach dem Berufsbildungsgesetz im Geschäftsbereich des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft, Forsten und Tourismus (Prüfungsordnung Berufsbildung – Landwirtschaft und Hauswirtschaft – LHBPO)“
  - a2-s02 `replace-words` in § 2 Abs. 5: „In der Überschrift und in § 2 Abs. 5 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…ng setzt das Staatsministerium für Ernährung, Landwirtschaft und Forsten (Staatsministerium) fest.“ · heute: „…ng setzt das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus (Staatsministerium) fest.“
- Beginn der Stichtagsfassung: 2023-02-01 – Vorangehende Änderung § 1 der Verordnung vom 4. Januar 2023 (GVBl. S. 10): „Diese Verordnung tritt am 1. Februar 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-10/, SHA-256 1c95ac663be4a65d…

### BayLGRG

- Änderung GVBl. 2024 S. 205 (https://www.verkuendung-bayern.de/gvbl/2024-205/, SHA-256 `d5f4d6f4b23d95e1…`), verkündet 2024-07-15, in Kraft 2024-07-16 („Dieses Gesetz tritt am 16. Juli 2024 in Kraft.“)
  - a1-s01 `replace-final-punctuation` in Art. 2 Abs. 3 Satz 1 Nr. 23: „In Nr. 23 wird der Punkt am Ende durch ein Komma ersetzt.“
    - Stichtag: „…erische Hochschulen mit pflegewissenschaftlichem Studiengang.“ · heute: „…erische Hochschulen mit pflegewissenschaftlichem Studiengang,“
  - a1-s02 `insert-block` in Art. 2 Abs. 3 Satz 1 Nr. 24: „Die folgenden Nrn. 24 und 25 werden angefügt: „24. Kassenärztliche Vereinigung Bayerns, 25. Kassenzahnärztliche Vereinigung Bayerns.““
    - Stichtag: „(Glied fehlt)“ · heute: „24. Kassenärztliche Vereinigung Bayerns,“
  - a1-s03 `insert-block` in Art. 2 Abs. 3 Satz 1 Nr. 25: „Die folgenden Nrn. 24 und 25 werden angefügt: „24. Kassenärztliche Vereinigung Bayerns, 25. Kassenzahnärztliche Vereinigung Bayerns.““
    - Stichtag: „(Glied fehlt)“ · heute: „25. Kassenzahnärztliche Vereinigung Bayerns.“
- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - a2-s01 `replace-words` in Art. 1 Satz 3: „In Art. 1 Satz 3 und Art. 5 Satz 2 werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…i. ³Einmal im Jahr berichtet er dem Ausschuss für Gesundheit und Pflege schriftlich über seine Aktivitäten und den Umset…“ · heute: „…i. ³Einmal im Jahr berichtet er dem Ausschuss für Gesundheit, Pflege und Prävention schriftlich über seine Aktivitäten und den Umset…“
  - a2-s02 `replace-words` in Art. 5 Satz 2: „In Art. 1 Satz 3 und Art. 5 Satz 2 werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…gesundheitsrat selbst. ²Das Staatsministerium für Gesundheit und Pflege führt die Geschäfte.“ · heute: „…gesundheitsrat selbst. ²Das Staatsministerium für Gesundheit, Pflege und Prävention führt die Geschäfte.“
- Beginn der Stichtagsfassung: 2022-06-01 – Vorangehende Änderung Art. 32a Abs. 2 des Gesetzes vom 10. Mai 2022 (GVBl. S. 182): „Dieses Gesetz tritt am 1. Juni 2022 in Kraft.“ „Abweichend von Satz 1 treten in Kraft: 2. Art. 32a Abs. 19 mit Wirkung vom 31. Dezember 2021;“ – https://www.verkuendung-bayern.de/gvbl/2022-182/, SHA-256 4993cbff78013bd9…

### BayRKG

- Änderung GVBl. 2025 S. 643 (https://www.verkuendung-bayern.de/gvbl/2025-643/, SHA-256 `d3c1f61b38ceea50…`), verkündet 2025-12-30, in Kraft 2026-01-01 („Dieses Gesetz tritt am 1. Januar 2026 in Kraft.“)
  - s01 `insert-words` in Art. 6 Abs. 6 Satz 1 Nr. 4: „In Art. 6 Abs. 6 Satz 1 Nr. 4 wird nach der Angabe „Fahrrads“ die Angabe „oder elektrisch betriebenen, zweirädrigen Fahrzeugs“ eingefügt.“
    - Stichtag: „Fahrrads“ · heute: „Fahrrads oder elektrisch betriebenen, zweirädrigen Fahrzeugs“
  - s02 `append-words` in Art. 26 Überschrift: „Der Überschrift wird die Angabe „ , Verordnungsermächtigung“ angefügt.“
    - Stichtag: „Zuständigkeit“ · heute: „Zuständigkeit, Verordnungsermächtigung“
  - s03 `replace-words` in Art. 26 Satz 4: „In Satz 4 wird die Angabe „der Dienstreise“ durch die Angabe „von Reisen und Dienstgängen, deren Kosten nach Maßgabe dieses Gesetzes durch den Freistaat Bayern zu tragen sein können,“ ersetzt.“
    - Stichtag: „…staatlichen Bereich durch Rechtsverordnung die Organisation der Dienstreise sowie die Festsetzung und Anordnung der Reis…“ · heute: „…staatlichen Bereich durch Rechtsverordnung die Organisation von Reisen und Dienstgängen, deren Kosten nach Maßgabe dieses Gesetzes durch den Freistaat Bayern zu tragen sein können, sowie die Festsetzung und Anordnung der Reis…“
- Beginn der Stichtagsfassung: 2023-07-15 – Vorangehende Änderung § 4 des Gesetzes vom 7. Juli 2023 (GVBl. S. 313): „Dieses Gesetz tritt am 15. Juli 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-313/, SHA-256 55e4b93b8ff5f85f…

### BayRMRatV

- Änderung GVBl. 2024 S. 334 (https://www.verkuendung-bayern.de/gvbl/2024-334/, SHA-256 `4b75b9473ef07f71…`), verkündet 2024-08-14, in Kraft 2024-08-15 („Diese Verordnung tritt am 15. August 2024 in Kraft.“)
  - s01 `replace-words` in § 1 Abs. 3 Satz 5: „In Satz 5 wird das Wort „öffentlich“ durch die Wörter „dem Rundfunkrat“ ersetzt.“
    - Stichtag: „…bunden. ⁵Die Entscheidung bedarf keiner Begründung und wird öffentlich bekannt gegeben.“ · heute: „…bunden. ⁵Die Entscheidung bedarf keiner Begründung und wird dem Rundfunkrat bekannt gegeben.“
  - s02 `insert-sentence` in § 1 Abs. 3: „Folgender Satz 6 wird angefügt: „⁶Die zugelassenen Organisationen sind auf der Internetseite des Bayerischen Rundfunks zu veröffentlichen.““
    - Stichtag: „(Satz fehlt)“ · heute: „⁶Die zugelassenen Organisationen sind auf der Internetseite des Bayerischen Rundfunks zu veröffentlichen.“
  - s03 `number-sentences` in § 6: „Der Wortlaut wird Satz 1.“
    - Stichtag: „(ohne Satznummer)“ · heute: „¹“
  - s04 `insert-sentence` in § 6: „Folgender Satz 2 wird angefügt: „²An die Stelle der Internetseite des Bayerischen Rundfunks tritt die Internetseite der Landeszentrale.““
    - Stichtag: „(Satz fehlt)“ · heute: „²An die Stelle der Internetseite des Bayerischen Rundfunks tritt die Internetseite der Landeszentrale.“
- Beginn der Stichtagsfassung: 2021-07-01 – Vorangehende Änderung vom 15. Juni 2021 (GVBl. S. 353) (§ 1): „Diese Verordnung tritt am 1. Juli 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2021-353/, SHA-256 a43449b5ace77ef1…

### BaySchBQuVO

- Änderung GVBl. 2024 S. 281 (https://www.verkuendung-bayern.de/gvbl/2024-281/, SHA-256 `c823a4a8c6458980…`), verkündet 2024-07-30, in Kraft 2024-08-01 („Diese Verordnung tritt am 1. August 2024 in Kraft.“)
  - s01 `insert-block` in § 2 Satz 3 Nr. 5: „Nach Nr. 4 wird folgende Nr. 5 eingefügt: „5. fortlaufend Daten und Befunde zum bayerischen Schulwesen zu erfassen und durch ein flächendeckendes Bildungsmonitoring Empfehlungen zur Qualitätssicherung und zur Qualitätsentwicklung der bayerischen Schulen zu geben,“.“
    - Stichtag: „(Glied fehlt)“ · heute: „5. fortlaufend Daten und Befunde zum bayerischen Schulwesen zu erfassen und durch ein flächendeckendes Bildungsmonitoring Empfehlungen zur Qualitätssicherung und zur Qualitätsentwicklung der bayerisch“
  - s02 `relabel` in § 2 Satz 3 Nr. 7 → Nr. 8: „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“
    - Stichtag: „7.“ · heute: „8.“
  - s03 `relabel` in § 2 Satz 3 Nr. 6 → Nr. 7: „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“
    - Stichtag: „6.“ · heute: „7.“
  - s04 `relabel` in § 2 Satz 3 Nr. 5 → Nr. 6: „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“
    - Stichtag: „5.“ · heute: „6.“
- Beginn der Stichtagsfassung: 2018-09-01 – Vorangehende Änderung § 2 der Verordnung vom 31. Oktober 2018 (GVBl. S. 816): „Diese Verordnung tritt mit Wirkung vom 1. September 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-816/, SHA-256 e352a3e89d002348…

### BaySpielbG

- Änderung GVBl. 2024 S. 573 (https://www.verkuendung-bayern.de/gvbl/2024-573/, SHA-256 `a8a2ee825d0cadfc…`), verkündet 2024-12-16, in Kraft 2025-01-01 („Abweichend von Satz 1 tritt § 9 am 1. Januar 2025 in Kraft.“)
  - s01 `number-sentences` in Art. 7 Abs. 7: „Der Wortlaut wird Satz 1.“
    - Stichtag: „(ohne Satznummer)“ · heute: „¹“
  - s02 `insert-sentence` in Art. 7 Abs. 7: „Folgender Satz 2 wird angefügt: „²Art. 7a bleibt unberührt.““
    - Stichtag: „(Satz fehlt)“ · heute: „²Art. 7a bleibt unberührt.“
  - s03 `insert-block` in Art. 7a: „Nach Art. 7 wird folgender Art. 7a eingefügt: „Art. 7a Ausgleichsabgabe ¹Sofern die Spielbankabgabe nach Art. 7 Abs. 1 unter Berücksichtigung der Ermäßigung um die spielbetriebsbedingte Umsatzsteuer nach Art. 7 Abs. 8 für Zeiträume ab dem 1. Januar 2025 niedriger ist als eine fiktive Steuerlast bei “
    - Stichtag: „(Glied fehlt)“ · heute: „Art. 7a Ausgleichsabgabe ¹Sofern die Spielbankabgabe nach Art. 7 Abs. 1 unter Berücksichtigung der Ermäßigung um die spielbetriebsbedingte Umsatzsteuer nach Art. 7 Abs. 8 für Zeiträume ab dem 1. Janua“
  - s04 `replace-final-punctuation` in Art. 9 Abs. 2 Satz 5: „In Abs. 2 Satz 5 wird der Punkt am Ende durch die Wörter „oder gemäß § 87a AO oder mittels eines durch die oberste Finanzbehörde festgelegten, sicheren Verfahrens elektronisch zu übersenden.“ ersetzt.“
    - Stichtag: „…ternehmens berechtigten Person eigenhändig zu unterschreiben. ⁶Sie gelten als Steueranmeldung im Sinn des § 168 AO.“ · heute: „…ternehmens berechtigten Person eigenhändig zu unterschreiben oder gemäß § 87a AO oder mittels eines durch die oberste Finanzbehörde festgelegten, sicheren Verfahrens elektronisch zu übersenden. ⁶Sie gelten als Steueranmeldung im Sinn des § 168 AO.“
  - s05 `replace-words` in Art. 9 Abs. 3 Satz 3: „In Satz 3 werden die Wörter „eines Monats“ durch die Wörter „sechs Monaten“ ersetzt.“
    - Stichtag: „…der Spielbank bedingt sind. ³Die Steueranmeldung ist binnen eines Monats nach Ablauf des Kalenderjahres abzugeben. ⁴Sie …“ · heute: „…der Spielbank bedingt sind. ³Die Steueranmeldung ist binnen sechs Monaten nach Ablauf des Kalenderjahres abzugeben. ⁴Sie …“
  - s06 `replace-final-punctuation` in Art. 9 Abs. 3 Satz 4: „In Satz 4 wird der Punkt am Ende durch die Wörter „oder gemäß § 87a AO oder mittels eines durch die oberste Finanzbehörde festgelegten, sicheren Verfahrens elektronisch zu übersenden.“ ersetzt.“
    - Stichtag: „…ternehmens berechtigten Person eigenhändig zu unterschreiben. ⁵Sie gilt als Steueranmeldung im Sinn des § 168 AO. ⁶Führt…“ · heute: „…ternehmens berechtigten Person eigenhändig zu unterschreiben oder gemäß § 87a AO oder mittels eines durch die oberste Finanzbehörde festgelegten, sicheren Verfahrens elektronisch zu übersenden. ⁵Sie gilt als Steueranmeldung im Sinn des § 168 AO. ⁶Führt…“
  - s07 `insert-block` in Art. 9 Abs. 4: „Folgender Abs. 4 wird angefügt: „(4) ¹Das Spielbankunternehmen hat der zuständigen Finanzbehörde neben der Steueranmeldung zur Spielbankabgabe für das Kalenderjahr spätestens sechs Monate nach Ablauf des Kalenderjahres eine fiktive Vergleichsberechnung nach Art. 7a, aus der es die zu entrichtende Au“
    - Stichtag: „(Glied fehlt)“ · heute: „(4) ¹Das Spielbankunternehmen hat der zuständigen Finanzbehörde neben der Steueranmeldung zur Spielbankabgabe für das Kalenderjahr spätestens sechs Monate nach Ablauf des Kalenderjahres eine fiktive V“
  - s08 `replace-words` in Art. 10 Abs. 1: „In Abs. 1 wird das Wort „wird“ durch die Wörter „und die Ausgleichsabgabe werden“ ersetzt.“
    - Stichtag: „Die Spielbankabgabe wird durch das vom Staatsministerium der Finanzen und für He…“ · heute: „Die Spielbankabgabe und die Ausgleichsabgabe werden durch das vom Staatsministerium der Finanzen und für He…“
  - s09 `insert-words` in Art. 10 Abs. 2: „In Abs. 2 werden nach dem Wort „Spielbankabgabe“ die Wörter „und die Ausgleichsabgabe“ eingefügt.“
    - Stichtag: „Für die Spielbankabgabe gelten, soweit sich aus diesem Gesetz nichts Abweichendes e…“ · heute: „Für die Spielbankabgabe und die Ausgleichsabgabe gelten, soweit sich aus diesem Gesetz nichts Abweichendes e…“
- Beginn der Stichtagsfassung: 2022-05-01 – Vorangehende Änderung § 2 des Gesetzes vom 22. April 2022 (GVBl. S. 147): „Dieses Gesetz tritt am 1. Mai 2022 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2022-147/, SHA-256 fe10637f07cbc43a…

### BayTNAV

- Änderung GVBl. 2025 S. 545 (https://www.verkuendung-bayern.de/gvbl/2025-545/, SHA-256 `63798818a6b3cd8e…`), verkündet 2025-10-30, in Kraft 2025-11-01 („Diese Verordnung tritt am 1. November 2025 in Kraft.“)
  - s01 `number-sentences` in § 1: „Der Wortlaut wird Satz 1.“
    - Stichtag: „(ohne Satznummer)“ · heute: „¹“
  - s02 `insert-sentence` in § 1: „Folgender Satz 2 wird angefügt: „²Mindestens drei Mitglieder des Gründungspräsidiums müssen Professoren der Universität sein.““
    - Stichtag: „(Satz fehlt)“ · heute: „²Mindestens drei Mitglieder des Gründungspräsidiums müssen Professoren der Universität sein.“
  - s03 `recast` in § 4 Abs. 2 Satz 3: „In Abs. 2 wird Satz 3 durch die folgenden Sätze 3 bis 6 ersetzt: „³Zum Gründungsvizepräsidenten können neben den der Universität angehörenden Professoren bis zu zwei aus dem Kreis der sonstigen hauptberuflichen wissenschaftlichen und künstlerischen Mitarbeiter und Promovierenden (Art. 19 Abs. 2 Satz“
    - Stichtag: „…tens für fünf weitere Jahre, möglich. ³Zwei der Gründungsvizepräsidenten können dem Kreis der sonstigen hauptberuflichen wissenschaftlichen Mitarbeiter angehören.“ · heute: „…tens für fünf weitere Jahre, möglich. ³Zum Gründungsvizepräsidenten können neben den der Universität angehörenden Professoren bis zu zwei aus dem Kreis der sonstigen hauptberuflichen wissenschaftlichen und künstlerischen Mitarbeiter und Promovierenden (Art. 19 Abs. 2 Satz 1 Nr. 2 des Bayerischen Hochschulinnovationsgesetzes – BayHIG) bestellt werden. ⁴Als Gründungsvizepräsidenten im Sinne von Abs.…“
  - s04 `recast` in § 4 Abs. 1 (ganzes Glied aus der Stammverkündung) (Portalgestalt nach Konvention des Amtsblatts: subparagraph>item (63 Normen)): „Nr. 2 wird wie folgt gefasst: „2. Digitalisierung und Künstliche Intelligenz,“. \| Nr. 3 wird wie folgt gefasst: „3. Forschung, Innovation und Unternehmertum,“. \| Nr. 4 wird wie folgt gefasst: „4. Beschäftigte, Alumni und Gleichstellung.“ \| Folgender Satz 3 wird angefügt: „³Die im Satz 1 Nr. 1 bis“
    - Stichtag: „… und Internationales, 2. Digitalisierung, 3. Forschung, Innovation und Entrepreneurship, 4. Human Resources, Alumni und Gleichstellung. ²Der Gründungspräsident kann im Einvernehmen mit dem Staatsministerium die in Satz 1 Nr. 2 bis 4 aufgeführten Geschäftsbereiche anders zuteilen.“ · heute: „… und Internationales, 2. Digitalisierung und Künstliche Intelligenz, 3. Forschung, Innovation und Unternehmertum, 4. Beschäftigte, Alumni und Gleichstellung. ²Der Gründungspräsident kann im Einvernehmen mit dem Staatsministerium die in Satz 1 Nr. 2 bis 4 aufgeführten Geschäftsbereiche anders zuteilen. ³Die im Satz 1 Nr. 1 bis 4 aufgeführten Geschäftsbereiche dürfen in englischer Sprache wie folgt …“
- Beginn der Stichtagsfassung: 2021-01-01 – Inkrafttretensvorschrift im Stichtagstext, § 12 Inkrafttreten: „Diese Verordnung tritt am 1. Januar 2021 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung GVBl. 2020 S. 710 (https://www.verkuendung-bayern.de/gvbl/2020-710/, SHA-256 7cff507076795a2f…); Wortlaut gleich (11009 Zeichen, typografisch vereinheitlicht)

### BayUIG

- Änderung GVBl. 2026 S. 113 (https://www.verkuendung-bayern.de/gvbl/2026-113/, SHA-256 `3cce9578ab27c07d…`), verkündet 2026-03-31, in Kraft 2026-04-01 („Dieses Gesetz tritt am 1. April 2026 in Kraft.“)
  - a1-s01 `number-sentences` in Art. 7 Abs. 2 (Text vor der Aufzählung): „Der Wortlaut wird Satz 1.“
    - Stichtag: „(ohne Satznummer)“ · heute: „¹“
  - a1-s02 `insert-sentence` in Art. 7 Abs. 2 (Schlusstext hinter der Aufzählung): „Folgender Satz 2 wird angefügt: „²Die Voraussetzungen nach Satz 1 Nr. 2 sind insbesondere gegeben, soweit ein Antrag sich auf die Bekanntgabe jagdrechtlicher Nachweise über Tätigkeiten im Zusammenhang mit dem Erlegen von Tieren bezieht.““
    - Stichtag: „(Satz fehlt)“ · heute: „²Die Voraussetzungen nach Satz 1 Nr. 2 sind insbesondere gegeben, soweit ein Antrag sich auf die Bekanntgabe jagdrechtlicher Nachweise über Tätigkeiten im Zusammenhang mit dem Erlegen von Tieren bezie“
- Änderung GVBl. 2024 S. 605 (https://www.verkuendung-bayern.de/gvbl/2024-605/, SHA-256 `4e27735428557fbb…`), verkündet 2024-12-30, in Kraft 2025-01-01 („Dieses Gesetz tritt am 1. Januar 2025 in Kraft.“)
  - a2-s01 `number-sentences` in Art. 2 Abs. 1 (Text vor der Aufzählung): „Der Wortlaut wird Satz 1.“
    - Stichtag: „(ohne Satznummer)“ · heute: „¹“
  - a2-s02 `insert-sentence` in Art. 2 Abs. 1 (Satz 2 als eigener Schlusstext hinter der Aufzählung): „Folgender Satz 2 wird angefügt: „²Der Oberste Rechnungshof ist außer in Bezug auf seine eigene Verwaltungsführung keine informationspflichtige Stelle.““
    - Stichtag: „(Glied fehlt)“ · heute: „²Der Oberste Rechnungshof ist außer in Bezug auf seine eigene Verwaltungsführung keine informationspflichtige Stelle“
- Beginn der Stichtagsfassung: 2015-12-30 – Vorangehende Änderung Art. 9a Abs. 15 des Gesetzes vom 22. Dezember 2015 (GVBl. S. 458): „Dieses Gesetz tritt am 30. Dezember 2015 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2015-458/, SHA-256 69bd8e7b435c2eb0…

### BayUStuetzV

- Änderung GVBl. 2025 S. 605 (https://www.verkuendung-bayern.de/gvbl/2025-605/, SHA-256 `02e55601dde7f6dc…`), verkündet 2025-12-15, in Kraft 2025-12-31 („Diese Verordnung tritt am 31. Dezember 2025 in Kraft.“)
  - s01 `replace-words` in § 1 Abs. 1: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
    - Stichtag: „…auf je fünf Millionen Euro pro Jahr, für die Jahre 2021 bis 2025 auf je eine Million Euro pro Jahr festgesetzt.“ · heute: „…auf je fünf Millionen Euro pro Jahr, für die Jahre 2021 bis 2030 auf je eine Million Euro pro Jahr festgesetzt.“
  - s02 `replace-words` in § 1 Abs. 3 Satz 8: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
    - Stichtag: „…r Antrag auf Beitragsreduzierung kann nur bis zum 1. Januar 2025 gestellt werden.“ · heute: „…r Antrag auf Beitragsreduzierung kann nur bis zum 1. Januar 2030 gestellt werden.“
  - s03 `replace-words` in § 3 Abs. 3 Satz 1: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
    - Stichtag: „…ses aus dem Unterstützungsfonds, frühestens am 31. Dezember 2025. ²Das Staatsministerium für Umwelt und Verbraucherschut…“ · heute: „…ses aus dem Unterstützungsfonds, frühestens am 31. Dezember 2030. ²Das Staatsministerium für Umwelt und Verbraucherschut…“
  - s04 `replace-words` in § 5 Satz 2: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
    - Stichtag: „…n Kraft. ²Die §§ 1 und 2 treten mit Ablauf des 31. Dezember 2025 außer Kraft.“ · heute: „…n Kraft. ²Die §§ 1 und 2 treten mit Ablauf des 31. Dezember 2030 außer Kraft.“
- Beginn der Stichtagsfassung: 2020-12-31 – Vorangehende Änderung vom 16. Dezember 2020 (GVBl. S. 709) (§ 1): „Diese Verordnung tritt am 31. Dezember 2020 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-709/, SHA-256 f6e382d7415cb55d…

### BayUntVergV

- Änderung GVBl. 2026 S. 425 (https://www.verkuendung-bayern.de/gvbl/2026-425/, SHA-256 `e6ba532d1b2747b4…`), verkündet 2026-07-30, in Kraft 2026-08-01 („Diese Verordnung tritt am 1. August 2026 in Kraft.“)
  - s01 `replace-words` in § 1 Abs. 1: „In § 1 Abs. 1 wird die Angabe „Anwärtern“ durch die Angabe „Anwärter“ ersetzt.“
    - Stichtag: „…aßgabe der §§ 5 bis 7 mit den Bezügen für Anwärterinnen und Anwärtern im Sinn des Art. 75 des Bayerischen Besoldungsgeset…“ · heute: „…aßgabe der §§ 5 bis 7 mit den Bezügen für Anwärterinnen und Anwärter im Sinn des Art. 75 des Bayerischen Besoldungsgeset…“
  - s02 `replace-words` in § 4 Abs. 2 Satz 1: „Die Angabe „30“ wird durch die Angabe „28“ ersetzt.“
    - Stichtag: „…st, eine sonstige schulische Veranstaltung im Sinn des Art. 30 Satz 2 des Bayerischen Gesetzes über das Erziehungs- und …“ · heute: „…st, eine sonstige schulische Veranstaltung im Sinn des Art. 28 Satz 2 des Bayerischen Gesetzes über das Erziehungs- und …“
  - s03 `insert-words` in § 4 Abs. 2 Satz 1: „Nach der Angabe „Unterrichtswesen“ wird die Angabe „(BayEUG)“ eingefügt.“
    - Stichtag: „…yerischen Gesetzes über das Erziehungs- und Unterrichtswesen selbstständig durch, sind die hierdurch ausfallenden Unterr…“ · heute: „…yerischen Gesetzes über das Erziehungs- und Unterrichtswesen (BayEUG) selbstständig durch, sind die hierdurch ausfallenden Unterr…“
- Beginn der Stichtagsfassung: 2013-08-01 – Inkrafttretensvorschrift im Stichtagstext, § 8 Inkrafttreten: „Diese Verordnung tritt am 1. August 2013 in Kraft.“

### BayVGTierS

- Änderung GVBl. 2026 S. 108 (https://www.verkuendung-bayern.de/gvbl/2026-108/, SHA-256 `4d81e04ae11f579c…`), verkündet 2026-03-31, in Kraft 2026-04-01 („Dieses Gesetz tritt am 1. April 2026 in Kraft.“)
  - a1-s01 `insert-block` in Art. 5 Abs. 5: „Dem Art. 5 wird folgender Abs. 5 angefügt: „(5) ¹Auf Anforderung dürfen der Tierseuchenkasse durch die zuständige Behörde oder die von ihr beauftragte Stelle Daten, die nach den Vorschriften der Viehverkehrsverordnung oder des Art. 109 Abs. 1 der Verordnung (EU) 2016/429 und der Delegierten Verordnu“
    - Stichtag: „(Glied fehlt)“ · heute: „(5) ¹Auf Anforderung dürfen der Tierseuchenkasse durch die zuständige Behörde oder die von ihr beauftragte Stelle Daten, die nach den Vorschriften der Viehverkehrsverordnung oder des Art. 109 Abs. 1 d“
- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - a2-s01 `replace-words` in Art. 5 Abs. 4 Satz 6: „In Art. 5 Abs. 4 Satz 6 und Art. 7 Abs. 1 Satz 3 Nr. 6 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…hmen mit dem Staatsministerium für Ernährung, Landwirtschaft und Forsten durch Rechtsverordnung“ · heute: „…hmen mit dem Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus durch Rechtsverordnung“
  - a2-s02 `replace-words` in Art. 7 Abs. 1 Satz 3 Nr. 6: „In Art. 5 Abs. 4 Satz 6 und Art. 7 Abs. 1 Satz 3 Nr. 6 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…son, die das Staatsministerium für Ernährung, Landwirtschaft und Forsten vertritt.“ · heute: „…son, die das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus vertritt.“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 334 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayVHBSt

- Änderung GVBl. 2024 S. 155 (https://www.verkuendung-bayern.de/gvbl/2024-155/, SHA-256 `c5448f033faf6f4a…`), verkündet 2024-06-28, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `append-words` in § 3 Überschrift: „Der Überschrift werden die Wörter „und Überwachung von Anbauvereinigungen“ angefügt.“
    - Stichtag: „Lebensmittelüberwachung“ · heute: „Lebensmittelüberwachung und Überwachung von Anbauvereinigungen“
  - s02 `insert-words` in § 3 Satz 2: „In Satz 2 werden nach dem Wort „Lebensmittelkontrollen“ die Wörter „oder bei der Überwachung von Anbauvereinigungen im Sinne des Konsumcannabisgesetzes“ eingefügt.“
    - Stichtag: „…erheit, sofern sie im Außendienst bei Lebensmittelkontrollen eingesetzt werden und mindestens zwei Jahre im Dienst der V…“ · heute: „…erheit, sofern sie im Außendienst bei Lebensmittelkontrollen oder bei der Überwachung von Anbauvereinigungen im Sinne des Konsumcannabisgesetzes eingesetzt werden und mindestens zwei Jahre im Dienst der V…“
  - s03 `insert-sentence` in § 3: „Folgender Satz 3 wird angefügt: „³Soweit nach den Sätzen 1 und 2 Angestellte tätig werden sollen, müssen diese im öffentlichen Dienst stehen und das 21. Lebensjahr vollendet haben.““
    - Stichtag: „(Satz fehlt)“ · heute: „³Soweit nach den Sätzen 1 und 2 Angestellte tätig werden sollen, müssen diese im öffentlichen Dienst stehen und das 21. Lebensjahr vollendet haben.“
- Beginn der Stichtagsfassung: 2018-06-30 – Vorangehende Änderung vom 15. Juni 2018 (GVBl. S. 515): „Diese Verordnung tritt am 30. Juni 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-515/, SHA-256 99ec6892b0284627…

### BayVV_1142_S_13045

- Änderung BayMBl. 2024 Nr. 139 (https://www.verkuendung-bayern.de/baymbl/2024-139/, SHA-256 `e009a56ab1e96ee7…`), verkündet 2024-03-20, in Kraft 2024-03-01 („Diese Bekanntmachung tritt mit Wirkung vom 1. März 2024 in Kraft.“)
  - s01 `replace-words` in Nr. 2.1 Satz 1: „In Nr. 2.1 Satz 1 wird das Wort „sechs“ durch das Wort „sieben“ ersetzt.“
    - Stichtag: „¹Der Bayerische Normenkontrollrat besteht aus bis zu sechs, mindestens jedoch aus vier Mitgliedern, die vom Minis…“ · heute: „¹Der Bayerische Normenkontrollrat besteht aus bis zu sieben, mindestens jedoch aus vier Mitgliedern, die vom Minis…“
  - s02 `recast` in Nr. 3.5, Nr. 3.6: „Die Nrn. 3.5 und 3.6 werden durch folgende Nr. 3.5 ersetzt: „3.5 ¹Die Tätigkeit des Bayerischen Normenkontrollrats ist vertraulich. ²Öffentlichkeit und Presse werden nur im Einvernehmen mit dem jeweils fachbetroffenen Staatsministerium unterrichtet.““
    - Stichtag: „3.5 ¹Der Bayerische Normenkontrollrat tritt nicht nach außen auf. ²Seine Empfehlungen werden nicht veröffentlicht. 3.6 ¹Die Tätigkeit des Bayerischen Normenkontrollrats ist vertraulich. ²Über Inhalt, Form und Ausmaß einer Unterrichtung von Öffentlichkeit und Presse entscheidet das jeweils fachbetrof“ · heute: „3.5 ¹Die Tätigkeit des Bayerischen Normenkontrollrats ist vertraulich. ²Öffentlichkeit und Presse werden nur im Einvernehmen mit dem jeweils fachbetroffenen Staatsministerium unterrichtet.“
  - s03 `recast` in Nr. 1.2 (ganzes Glied aus der Stammverkündung): „Vor dem Wort „Der“ wird die Satznummerierung „¹“ eingefügt. \| Folgender Satz 2 wird angefügt: „²Der Bayerische Normenkontrollrat ist eine öffentliche Stelle im Sinne des Bayerischen Datenschutzgesetzes.““
    - Stichtag: „1.2 Der Bayerische Normenkontrollrat genießt im Rahmen seiner Aufgabenstellung thematische Freiheit und fachliche Unabhängigkeit.“ · heute: „1.2 ¹Der Bayerische Normenkontrollrat genießt im Rahmen seiner Aufgabenstellung thematische Freiheit und fachliche Unabhängigkeit. ²Der Bayerische Normenkontrollrat ist eine öffentliche Stelle im Sinne des Bayerischen Datenschutzgesetzes.“
- Beginn der Stichtagsfassung: 2022-06-01 – Inkrafttretensvorschrift im Stichtagstext, 5. Inkrafttreten: „Diese Bekanntmachung tritt am 1. Juni 2022 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2022 Nr. 325 (https://www.verkuendung-bayern.de/baymbl/2022-325/, SHA-256 1087e9a584a03512…); Wortlaut gleich (3407 Zeichen, typografisch vereinheitlicht); in der Verkündung folgt die Unterschrift als Absatz („DerBayerischeMinisterpräsident“), im Portal in der Schlussformel

### BayVV_2032_3_K_12914

- Änderung BayMBl. 2026 Nr. 129 (https://www.verkuendung-bayern.de/baymbl/2026-129/, SHA-256 `4803ad75c2f2e35d…`), verkündet 2026-04-01, in Kraft 2026-04-01 („Diese Bekanntmachung tritt am 1. April 2026 in Kraft.“)
  - s01 `replace-words` in Nr. 1: „In Nr. 1 wird die Angabe „28. Februar 2022 (GVBl. S. 61)“ durch die Angabe „6. März 2026 (GVBl. S. 153)“ ersetzt.“
    - Stichtag: „…202, BayRS 2032-3-4-5-UK), die zuletzt durch Verordnung vom 28. Februar 2022 (GVBl. S. 61) geändert worden ist, gelten ents…“ · heute: „…202, BayRS 2032-3-4-5-UK), die zuletzt durch Verordnung vom 6. März 2026 (GVBl. S. 153) geändert worden ist, gelten ents…“
  - s02 `replace-words` in Nr. 2 Satz 1 Buchst. a: „In Buchst. a wird die Angabe „3,50 Euro“ durch die Angabe „3,85 Euro“ ersetzt.“
    - Stichtag: „3,50 Euro“ · heute: „3,85 Euro“
  - s03 `replace-words` in Nr. 2 Satz 1 Buchst. b: „In Buchst. b wird die Angabe „10,80 Euro“ durch die Angabe „11,90 Euro“ ersetzt.“
    - Stichtag: „10,80 Euro“ · heute: „11,90 Euro“
  - s04 `replace-words` in Nr. 3: „In Nr. 3 wird die Angabe „10,80 Euro“ durch die Angabe „11,90 Euro“ ersetzt.“
    - Stichtag: „…gesetzt werden, wird je angefangene Stunde Schreibtätigkeit 10,80 Euro Vergütung gewährt.“ · heute: „…gesetzt werden, wird je angefangene Stunde Schreibtätigkeit 11,90 Euro Vergütung gewährt.“
  - s05 `insert-block` in Nr. 4: „Nach Nr. 3 wird folgende Nr. 4 eingefügt: „4. ¹Für die Überprüfung von Aufgabenentwürfen werden folgende Vergütungen gewährt: a) Kontrolllesen der Aufgabenentwürfe hinsichtlich Vollständigkeit und Rechtschreibung je Einzelprüfung 2,00 Euro, b) Fachlich inhaltliche Überprüfung von Aufgabenentwürfen a“
    - Stichtag: „(Glied fehlt)“ · heute: „4. ¹Für die Überprüfung von Aufgabenentwürfen werden folgende Vergütungen gewährt: a) Kontrolllesen der Aufgabenentwürfe hinsichtlich Vollständigkeit und Rechtschreibung je Einzelprüfung 2,00 Euro, b“
  - s06 `relabel` in Nr. 4 → Nr. 5: „Die bisherige Nr. 4 wird Nr. 5 und wie folgt geändert:“
    - Stichtag: „4.“ · heute: „5.“
  - s07 `recast` in Nr. 5 Satz 3: „Satz 3 wird wie folgt gefasst: „³Die Auszahlung von Prüfungsvergütungen ab dem Prüfungstermin Frühjahr 2026 sowie Prüfungsvergütungen nach Nr. 1 für den Prüfungstermin Herbst 2025 richtet sich nach dieser Bekanntmachung in der ab dem 1. April 2026 geltenden Fassung.““
    - Stichtag: „…³Die Auszahlung von Prüfungsvergütungen nach Nr. 1 für den Prüfungstermin Herbst 2021 sowie die Auszahlung von Prüfungsvergütungen für den Prüfungstermin Frühjahr 2022 richtet sich bereits nach dieser Bekanntmachung.“ · heute: „…³Die Auszahlung von Prüfungsvergütungen ab dem Prüfungstermin Frühjahr 2026 sowie Prüfungsvergütungen nach Nr. 1 für den Prüfungstermin Herbst 2025 richtet sich nach dieser Bekanntmachung in der ab dem 1. April 2026 geltenden Fassung.“
  - s08 `insert-sentence` in Nr. 5: „Es wird folgender Satz 4 angefügt: „⁴Im Übrigen findet die am 31. März 2026 geltende Fassung Anwendung.““
    - Stichtag: „(Satz fehlt)“ · heute: „⁴Im Übrigen findet die am 31. März 2026 geltende Fassung Anwendung.“
- Beginn der Stichtagsfassung: 2022-04-06 – Inkrafttretensvorschrift im Stichtagstext, 4.: „Diese Bekanntmachung tritt am 6. April 2022 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2022 Nr. 216 (https://www.verkuendung-bayern.de/baymbl/2022-216/, SHA-256 e17fab703e975b80…); Wortlaut gleich (2236 Zeichen, typografisch vereinheitlicht)

### BayVV_2174_A_13397

- Änderung BayMBl. 2026 Nr. 268 (https://www.verkuendung-bayern.de/baymbl/2026-268/, SHA-256 `6d7c8ff854d9a1be…`), verkündet 2026-07-01, in Kraft 2026-06-24 („Diese Bekanntmachung tritt mit Wirkung vom 24. Juni 2026 in Kraft.“)
  - s01 `replace-words` in Vorbemerkung Satz 12: „In Satz 12 der Präambel wird die Angabe „2026“ durch die Angabe „2027“ ersetzt.“
    - Stichtag: „…ern werden für den Zeitraum bis einschließlich 31. Dezember 2026 folgende Regelungen getroffen:“ · heute: „…ern werden für den Zeitraum bis einschließlich 31. Dezember 2027 folgende Regelungen getroffen:“
  - s02 `replace-words` in Nr. 4.1 Spiegelstrich 5 Satz 3: „In Nr. 4.1 fünfter Spiegelstrich Satz 3 wird die Angabe „landesweiten Koordinierungsstelle gegen häusliche und sexualisierte Gewalt“ durch die Angabe „Landeskoordinierungsstelle Bayern gegen Gewalt“ ersetzt.“
    - Stichtag: „…hriftliche Absprachen zu treffen. ³Überregional ist mit der landesweiten Koordinierungsstelle gegen häusliche und sexualisierte Gewalt zusammenzuarb…“ · heute: „…hriftliche Absprachen zu treffen. ³Überregional ist mit der Landeskoordinierungsstelle Bayern gegen Gewalt zusammenzuarb…“
  - s03 `insert-words` in Nr. 5 Nr. 5.1: „In Nr. 5.1 werden nach der Angabe „wird“ die Angabe „als nicht rückzahlbarer Zuschuss“ eingefügt und die Angabe „Anteilfinanzierung“ durch die Angabe „Anteilsfinanzierung“ ersetzt.“
    - Stichtag: „Die staatliche Zuwendung wird im Rahmen einer Projektförderung als Anteilfinanzierung gew…“ · heute: „Die staatliche Zuwendung wird als nicht rückzahlbarer Zuschuss im Rahmen einer Projektförderung als Anteilfinanzierung gew…“
  - s04 `replace-words` in Nr. 5 Nr. 5.1: „In Nr. 5.1 werden nach der Angabe „wird“ die Angabe „als nicht rückzahlbarer Zuschuss“ eingefügt und die Angabe „Anteilfinanzierung“ durch die Angabe „Anteilsfinanzierung“ ersetzt.“
    - Stichtag: „…rückzahlbarer Zuschuss im Rahmen einer Projektförderung als Anteilfinanzierung gewährt.“ · heute: „…rückzahlbarer Zuschuss im Rahmen einer Projektförderung als Anteilsfinanzierung gewährt.“
  - s05 `insert-words` in Nr. 5 Nr. 5.3: „In Nr. 5.3 wird nach der Angabe „Förderung“ die Angabe „beträgt maximal 90 % der zuwendungsfähigen Gesamtausgaben und“ eingefügt.“
    - Stichtag: „Die Höhe der Förderung bestimmt sich folgendermaßen:“ · heute: „Die Höhe der Förderung beträgt maximal 90 % der zuwendungsfähigen Gesamtausgaben und bestimmt sich folgendermaßen:“
  - s06 `replace-words` in Nr. 7.1 Satz 1: „In Nr. 7.1 Satz 1 wird die Angabe „VV Nr. 12 zu Art. 44 BayHO“ durch die Angabe „VV Nr. 14 zu Art. 44 BayHO“ ersetzt.“
    - Stichtag: „…e mit der Richtlinie geförderten Maßnahmen werden gemäß der VV Nr. 12 zu Art. 44 BayHO einer Erfolgskontrolle unterzogen…“ · heute: „…e mit der Richtlinie geförderten Maßnahmen werden gemäß der VV Nr. 14 zu Art. 44 BayHO einer Erfolgskontrolle unterzogen…“
  - s07 `repeal-unit` in Nr. 8: „Nr. 8 wird aufgehoben.“
    - Stichtag: „8. Prüfungsrecht Der Bayerische Oberste Rechnungshof ist gemäß Art. 91 Abs. 1 Satz 1 Nr. 3 BayHO berechtigt, bei den Zuschussempfängern zu prüfen.“ · heute: „(aufgehoben)“
  - s08 `relabel` in Nr. 9 → Nr. 8: „Die bisherigen Nrn. 9 und 10 werden die Nrn. 8 und 9.“
    - Stichtag: „9.“ · heute: „8.“
  - s09 `relabel` in Nr. 10 → Nr. 9: „Die bisherigen Nrn. 9 und 10 werden die Nrn. 8 und 9.“
    - Stichtag: „10.“ · heute: „9.“
  - s10 `replace-words` in Nr. 8 Satz 1: „In der neuen Nr. 8 wird in Satz 1 die Angabe „2016/697“ durch die Angabe „2016/679“ ersetzt.“
    - Stichtag: „…zrechtlichen Bestimmungen, insbesondere die Verordnung (EU) 2016/697 (Datenschutz-Grundverordnung – DSGVO) einzuhalten.“ · heute: „…zrechtlichen Bestimmungen, insbesondere die Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung – DSGVO) einzuhalten.“
  - s11 `replace-words` in Nr. 9: „In der neuen Nr. 9 wird die Angabe „2026“ durch die Angabe „2027“ ersetzt.“
    - Stichtag: „… am 1. Januar 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft.“ · heute: „… am 1. Januar 2023 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.“
  - s12 `recast` in Nr. 6 Nr. 6.1 (ganzes Glied aus der Stammverkündung): „In Satz 1 wird die Angabe „Dezember“ durch die Angabe „September“ ersetzt. \| Die Sätze 3 und 7 werden aufgehoben. \| Die bisherigen Sätze 4 bis 6 werden die Sätze 3 bis 5 und die bisherigen Sätze 8 bis 12 werden die Sätze 6 bis 10. \| Im neuen Satz 4 wird die Angabe „weiteren“ gestrichen. \| Im neu“
    - Stichtag: „…lten Antragsformulars bis spätestens 1. Dezember des Jahres, das dem Förderjahr vorausgeht, schriftlich oder elektronisch einen Förderantrag zu stellen. ²Besteht die Fachstelle aus einer Kooperation von zwei Trägern, hat jeder Träger einen eigenen Antrag für seine Teilfachstelle zu stellen. ³Als Projektbeginn kann frühestens der 1. Januar 2023 beantragt werden. ⁴Der Bewilligungszeitraum endet am 3……“ · heute: „…lten Antragsformulars bis spätestens 1. September des Jahres, das dem Förderjahr vorausgeht, schriftlich oder elektronisch einen Förderantrag zu stellen. ²Besteht die Fachstelle aus einer Kooperation von zwei Trägern, hat jeder Träger einen eigenen Antrag für seine Teilfachstelle zu stellen. ³Der Bewilligungszeitraum endet am 31. Dezember des jeweiligen Haushaltsjahres. ⁴Die Bewilligungszeiträume ……“
  - s13 `recast` in Nr. 6 Nr. 6.2 (ganzes Glied aus der Stammverkündung): „In Satz 1 wird die Angabe „den VV Nrn. 10 und 11 zu Art. 44 BayHO sowie Nr. 6“ durch die Angabe „der VV Nr. 8 zu Art. 44 BayHO sowie Nr. 7“ ersetzt. \| Satz 2 wird aufgehoben. \| Die bisherigen Sätze 3 bis 9 werden die Sätze 2 bis 8.“
    - Stichtag: „6.2 ¹Der Verwendungsnachweis hat den VV Nrn. 10 und 11 zu Art. 44 BayHO sowie Nr. 6 der Allgemeinen Nebenbestimmungen für Zuwendungen zur Projektförderung (ANBest-P) zu entsprechen. ²Es wird der einfache Verwendungsnachweis ohne Vorlage von Belegen zugelassen. ³Im Sachbericht sind die Verwendung der Zuwendung sowie insbesondere die Durchführung der Aufgaben, das erzielte Ergebnis und gesammelte Er……“ · heute: „6.2 ¹Der Verwendungsnachweis hat der VV Nr. 8 zu Art. 44 BayHO sowie Nr. 7 der Allgemeinen Nebenbestimmungen für Zuwendungen zur Projektförderung (ANBest-P) zu entsprechen. ²Im Sachbericht sind die Verwendung der Zuwendung sowie insbesondere die Durchführung der Aufgaben, das erzielte Ergebnis und gesammelte Erfahrungen darzustellen. ³Wurden zu den gemäß Nr. 4.1 erforderlichen Kooperationen bei de……“
- Beginn der Stichtagsfassung: 2023-01-01 – Inkrafttretensvorschrift im Stichtagstext, 10. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt am 1. Januar 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft.“ · Außerkrafttreten der Norm erst 2026-12-31, nach dem Stichtag: „Diese Bekanntmachung tritt am 1. Januar 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2022 Nr. 652 (https://www.verkuendung-bayern.de/baymbl/2022-652/, SHA-256 aa7139627875e131…); Wortlaut gleich (15201 Zeichen, typografisch vereinheitlicht)

### BayVV_2175_4_G_14041

- Änderung BayMBl. 2024 Nr. 279 (https://www.verkuendung-bayern.de/baymbl/2024-279/, SHA-256 `21737ba66968ee0f…`), verkündet 2024-06-19, in Kraft 2024-06-27 („Diese Bekanntmachung tritt am 27. Juni 2024 in Kraft.“)
  - s01 `replace-words` in Nr. 6.6 Satz 2: „In Nr. 6.6 Satz 2 werden die Angabe „360/2012“ durch die Angabe „2023/2832“ und die Angabe „1407/2013“ durch die Angabe „2023/2831“ ersetzt.“
    - Stichtag: „…diesem Fall, ob die Voraussetzungen der Verordnung (EU) Nr. 360/2012 (DAWI-De-minimis-Verordnung), des Beschlusses 2012/…“ · heute: „…diesem Fall, ob die Voraussetzungen der Verordnung (EU) Nr. 2023/2832 (DAWI-De-minimis-Verordnung), des Beschlusses 2012/…“
  - s02 `replace-words` in Nr. 6.6 Satz 2: „In Nr. 6.6 Satz 2 werden die Angabe „360/2012“ durch die Angabe „2023/2832“ und die Angabe „1407/2013“ durch die Angabe „2023/2831“ ersetzt.“
    - Stichtag: „… (DAWI-Freistellungsbeschluss) oder der Verordnung (EU) Nr. 1407/2013 (De-minimis-Verordnung) vorliegen. ³Sofern eine DA…“ · heute: „… (DAWI-Freistellungsbeschluss) oder der Verordnung (EU) Nr. 2023/2831 (De-minimis-Verordnung) vorliegen. ³Sofern eine DA…“
- Beginn der Stichtagsfassung: 2023-10-05 – Inkrafttretensvorschrift im Stichtagstext, 10. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt am 5. Oktober 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft.“ · Außerkrafttreten der Norm erst 2026-12-31, nach dem Stichtag: „Diese Bekanntmachung tritt am 5. Oktober 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft“

### BayVV_2234_1_K_13989

- Änderung BayMBl. 2026 Nr. 286 (https://www.verkuendung-bayern.de/baymbl/2026-286/, SHA-256 `cee9e62f7b41b0b0…`), verkündet 2026-07-15, in Kraft 2026-08-01 („Diese Bekanntmachung tritt am 1. August 2026 in Kraft.“)
  - s01 `recast` in Nr. 6: „Nr. 6 wird wie folgt gefasst: „6.Hervorhebungen und Verweisungen Die Hilfsmittel dürfen keine Kommentierungen, Hilfsmittel nach Nr. 1.2, 1.3, 1.5 und 1.6 jedoch Hervorhebungen und Verweisungen enthalten.““
    - Stichtag: „6. Hervorhebungen und Verweisungen Die Hilfsmittel dürfen Hervorhebungen und Verweisungen, jedoch keine Kommentierungen enthalten.“ · heute: „6. Hervorhebungen und Verweisungen Die Hilfsmittel dürfen keine Kommentierungen, Hilfsmittel nach Nr. 1.2, 1.3, 1.5 und 1.6 jedoch Hervorhebungen und Verweisungen enthalten.“
- Beginn der Stichtagsfassung: 2023-09-01 – Inkrafttretensvorschrift im Stichtagstext, 7. Inkrafttreten: „Diese Bekanntmachung tritt am 1. September 2023 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2023 Nr. 429 (https://www.verkuendung-bayern.de/baymbl/2023-429/, SHA-256 299f509845d419f2…); Wortlaut gleich (2866 Zeichen, typografisch vereinheitlicht)

### BayVV_2235_1_1_5_K_13224

- Änderung BayMBl. 2024 Nr. 442 (https://www.verkuendung-bayern.de/baymbl/2024-442/, SHA-256 `3637f385238878da…`), verkündet 2024-09-25, in Kraft 2024-08-01 („Diese Bekanntmachung tritt mit Wirkung vom 1. August 2024 in Kraft.“)
  - s01 `insert-block` in Nr. 3: „Nach Nr. 2 wird folgende Nr. 3 eingefügt: „3. Fächer des Zusatzangebots aus dem Bereich Sport 3.1 Durchführung Die Fächer des Zusatzangebots „Tanz- und Bewegungskünstetheater“ und „Sport und Gesellschaft“ (Nrn. 2.1 und 2.2 der Anlage 4 GSO) werden als jeweils zweistündige Fächer auf der Grundlage de“
    - Stichtag: „(Glied fehlt)“ · heute: „3. Fächer des Zusatzangebots aus dem Bereich Sport 3.1 Durchführung Die Fächer des Zusatzangebots „Tanz- und Bewegungskünstetheater“ und „Sport und Gesellschaft“ (Nrn. 2.1 und 2.2 der Anlage 4 GSO) we“
  - s02 `relabel` in Nr. 3 → Nr. 4: „Die bisherige Nr. 3 wird Nr. 4.“
    - Stichtag: „3.“ · heute: „4.“
- Beginn der Stichtagsfassung: 2022-08-01 – Quellfehler in der Inkrafttretensregel: „mir Wirkung vom“ als „mit Wirkung vom“ gelesen (einzige Lesart) · Inkrafttretensvorschrift im Stichtagstext, 3. Inkrafttreten und Aufheben von Vorschriften: „Diese Bekanntmachung tritt für das neunjährige Gymnasium mir Wirkung vom 1. August 2022 in Kraft.“

### BayVV_2236_9_1_K_11147

- Änderung BayMBl. 2025 Nr. 175 (https://www.verkuendung-bayern.de/baymbl/2025-175/, SHA-256 `a206fff2115f667e…`), verkündet 2025-04-23, in Kraft 2025-06-01 („Diese Bekanntmachung tritt am 1. Juni 2025 in Kraft.“)
  - s01 `delete-words` in Nr. 6.4 Satz 2: „In Nr. 6.4 Satz 2 wird die Angabe „bzw. Nr. 1.3 VVK“ gestrichen.“
    - Stichtag: „…nimmt. ²Die Nr. 1.3 VV zu Art. 44 BayHO bzw. Nr. 1.3 VVK findet insoweit keine Anwendung.“ · heute: „…nimmt. ²Die Nr. 1.3 VV zu Art. 44 BayHO findet insoweit keine Anwendung.“
  - s02 `delete-words` in Nr. 6.5.3: „In Nr. 6.5.3 wird die Angabe „bzw. in Nr. 7.2 VVK“ gestrichen.“
    - Stichtag: „…risten in Nr. 7.2.2 VV zu Art. 44 BayHO bzw. in Nr. 7.2 VVK und die entsprechenden Nebenbestimmungen…“ · heute: „…risten in Nr. 7.2.2 VV zu Art. 44 BayHO und die entsprechenden Nebenbestimmungen…“
  - s03 `replace-words` in Nr. 8 Satz 2: „In Nr. 8 Satz 2 wird die Angabe „31. Juli 2025“ durch die Angabe „31. Juli 2032“ ersetzt.“
    - Stichtag: „…kung vom 1. Januar 2020 in Kraft. ²Sie tritt mit Ablauf des 31. Juli 2025 außer Kraft.“ · heute: „…kung vom 1. Januar 2020 in Kraft. ²Sie tritt mit Ablauf des 31. Juli 2032 außer Kraft.“
  - s04 `recast` in Nr. 1 (ganzes Glied aus der Stammverkündung): „In Nr. 1 wird die Satznummerierung aufgehoben und die Sätze 2 und 3 gestrichen.“
    - Stichtag: „1. Zweck der Förderung ¹Mit dem Schulversuch „Pädagogische Fachkraft für Grundschulkindbetreuung“ wird überprüft, inwieweit eine neue Fachschul-Fachrichtung mit eigenem Berufsabschluss zur Gewinnung von pädagogischen Fachkräften im sozialpädagogischen Arbeitsfeld beitragen kann. ²Das Staatsministerium wird die Ergebnisse des Schulversuchs rechtzeitig zum Ende des Schulversuchs mit Ablauf des Schul…“ · heute: „1. Zweck der Förderung Mit dem Schulversuch „Pädagogische Fachkraft für Grundschulkindbetreuung“ wird überprüft, inwieweit eine neue Fachschul-Fachrichtung mit eigenem Berufsabschluss zur Gewinnung von pädagogischen Fachkräften im sozialpädagogischen Arbeitsfeld beitragen kann.“
  - s05 `recast` in Nr. 5.3.2 (ganzes Glied aus der Stammverkündung): „In Satz 1 wird der dritte Spiegelstrich wie folgt gefasst: „− dem Betrag des Pflegebonus nach Nr. 1.3.7 – Staatlich anerkannte Fachakademien für Sozialpädagogik – der Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Pflege- und Gesundheitsbonus, Meisterbonus und B“
    - Stichtag: „…dem Betrag des Pflegebonus nach Nr. 1.3.6 – Staatlich anerkannte Fachakademien für Sozialpädagogik – der Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Pflege- und Gesundheitsbonus, Meisterbonus und Bonus für gleichgestellte Abschlüsse (Bonus), Erstattung der Gebühren für die Gebärdensprachdolmetscherprüfung sowie Meisterpreis vom 12. Juni 2019 (BayMBl. Nr. 23……“ · heute: „…dem Betrag des Pflegebonus nach Nr. 1.3.7 – Staatlich anerkannte Fachakademien für Sozialpädagogik – der Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Pflege- und Gesundheitsbonus, Meisterbonus und Bonus für gleichgestellte Abschlüsse (Bonus), Erstattung der Prüfungsgebühren für Dolmetscherinnen bzw. Dolmetscher für Deutsche Gebärdensprache, Meisterpreis, sow……“
- Beginn der Stichtagsfassung: 2020-01-01 – Inkrafttretensvorschrift im Stichtagstext, 8. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt mit Wirkung vom 1. Januar 2020 in Kraft.“ · Außerkrafttreten der Norm erst 2025-07-31, nach dem Stichtag: „Diese Bekanntmachung tritt mit Wirkung vom 1. Januar 2020 in Kraft. ²Sie tritt mit Ablauf des 31. Juli 2025 außer Kraft“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2020 Nr. 282 (https://www.verkuendung-bayern.de/baymbl/2020-282/, SHA-256 9d876f4f749a1176…); Wortlaut gleich (8055 Zeichen, typografisch vereinheitlicht)

### BayVV_2244_F_13266

- Änderung BayMBl. 2025 Nr. 394 (https://www.verkuendung-bayern.de/baymbl/2025-394/, SHA-256 `f35f1455d935a628…`), verkündet 2025-09-24, in Kraft 2025-09-30 („Diese Bekanntmachung tritt am 30. September 2025 in Kraft.“)
  - s01 `recast` in Nr. 4.1.1: „Nr. 4.1.1 wird wie folgt gefasst: „4.1.1 ¹Eine Förderung nach dieser Richtlinie kommt nur in Betracht, wenn die Zuwendungssumme mehr als 5 000 € beträgt. ²Abweichend von Satz 1 gilt für Zuwendungen an Kommunen eine Bagatellgrenze von 10 000 €. ³Der Antragsteller muss zudem in der Lage sein, seine fi“
    - Stichtag: „4.1.1 Eine Förderung nach dieser Richtlinie kommt nur in Betracht, wenn die zuwendungsfähigen Ausgaben je Vorhaben mehr als 15 000 € betragen und der Antragsteller in der Lage ist, seine finanzielle Leistungsfähigkeit zur Erbringung der Eigenmittel gemäß Nr. 5.4.2 nachzuweisen.“ · heute: „4.1.1 ¹Eine Förderung nach dieser Richtlinie kommt nur in Betracht, wenn die Zuwendungssumme mehr als 5 000 € beträgt. ²Abweichend von Satz 1 gilt für Zuwendungen an Kommunen eine Bagatellgrenze von 10 000 €. ³Der Antragsteller muss zudem in der Lage sein, seine finanzielle Leistungsfähigkeit zur Er“
  - s02 `replace-final-words` in Nr. 5.2 Buchst. e: „In Buchst. e wird die Angabe „;“ am Ende durch die Angabe „.“ ersetzt.“
    - Stichtag: „allgemeine Organisationskosten (zum Beispiel für Telefon, Ko…“ · heute: „allgemeine Organisationskosten (zum Beispiel für Telefon, Ko…“
  - s03 `repeal-unit` in Nr. 5.2 Buchst. f: „Buchst. f wird aufgehoben.“
    - Stichtag: „f) Kostenersatz für eingebrachte Arbeitsleistungen der Zuwendungsempfänger oder ihrer Mitglieder entsprechend den bekanntgemachten zuschussfähigen Höchstsätzen in der Ländlichen Entwicklung (ZHLE). In besonderen Ausnahmefällen kann ein darüber hinausgehender Kostenersatz in angemessener Höhe zugrund“ · heute: „(aufgehoben)“
  - s04 `insert-block` in Nr. 5.3 Buchst. f: „Folgender Buchst. f wird angefügt: „f) ¹Nicht kassenwirksame Aufwendungen, Rücklagen und Kosten. ²Davon abweichend können unentgeltlich erbrachte Arbeitsleistungen mit einem Wert von 12,15 € pro Stunde als zuwendungsfähig anerkannt werden. ³Bei Arbeitsleistungen, die eine besondere fachliche Qualifi“
    - Stichtag: „(Glied fehlt)“ · heute: „f) ¹Nicht kassenwirksame Aufwendungen, Rücklagen und Kosten. ²Davon abweichend können unentgeltlich erbrachte Arbeitsleistungen mit einem Wert von 12,15 € pro Stunde als zuwendungsfähig anerkannt werd“
  - s05 `insert-block` in Nr. 6.3.6: „Nach der Nr. 6.3.5 wird folgende Nr. 6.3.6 eingefügt: „6.3.6 ¹Bei einer Zuwendung, die den Betrag von 10 000 € (bei Kommunen: 100 000 €) nicht übersteigt, richtet sich das Verwendungsnachweisverfahren nach Art. 44a BayHO und den dazu erlassenen Verwaltungsvorschriften. ²Bis zum Erlass der in Satz 1 “
    - Stichtag: „(Glied fehlt)“ · heute: „6.3.6 ¹Bei einer Zuwendung, die den Betrag von 10 000 € (bei Kommunen: 100 000 €) nicht übersteigt, richtet sich das Verwendungsnachweisverfahren nach Art. 44a BayHO und den dazu erlassenen Verwaltung“
  - s06 `replace-words` in Nr. 8 Halbsatz 2: „In Nr. 8 Halbsatz 2 wird die Angabe „2025“ durch die Angabe „2028“ ersetzt.“
    - Stichtag: „…tober 2022 in Kraft; sie tritt mit Ablauf des 30. September 2025 außer Kraft.“ · heute: „…tober 2022 in Kraft; sie tritt mit Ablauf des 30. September 2028 außer Kraft.“
  - s07 `recast` in Nr. 5.3 Buchst. e (ganzes Glied aus der Stammverkündung): „In Buchst. e wird die Angabe „und Schuhe“ durch die Angabe „ , Requisiten und Kulissen“ und die Angabe „.“ am Ende durch die Angabe „;“ ersetzt.“
    - Stichtag: „…lbetrieb, insbesondere Kostümausstattung und Schuhe, sowie für Vereinsarchive.“ · heute: „…lbetrieb, insbesondere Kostümausstattung, Requisiten und Kulissen, sowie für Vereinsarchive;“
  - s08 `recast` in Nr. 5.4.2 (ganzes Glied aus der Stammverkündung): „Die Angabe „Die Eigenmittel“ wird durch die Angabe „¹Der Eigenanteil“ und die Angabe „müssen“ durch die Angabe „muss“ ersetzt. \| Folgender Satz 2 wird angefügt: „²Sind unentgeltliche Arbeitsleistungen nach Nr. 5.3 Buchst. f Satz 2 als fiktive zuwendungsfähige Ausgaben anerkannt worden, sind sie fin“
    - Stichtag: „5.4.2 Die Eigenmittel des Zuwendungsempfängers nach Abzug von Zuwendungen und Finanzierungsbeteiligungen Dritter müssen mindestens 10 % der zuwendungsfähigen Ausgaben betragen.“ · heute: „5.4.2 ¹Der Eigenanteil des Zuwendungsempfängers nach Abzug von Zuwendungen und Finanzierungsbeteiligungen Dritter muss mindestens 10 % der zuwendungsfähigen Ausgaben betragen. ²Sind unentgeltliche Arbeitsleistungen nach Nr. 5.3 Buchst. f Satz 2 als fiktive zuwendungsfähige Ausgaben anerkannt worden, sind sie finanzierungsseitig in gleicher Höhe als Teil des Eigenanteils im Finanzierungsplan darzus…“
- Beginn der Stichtagsfassung: 2023-05-01 – Vorangehende Änderung vom 13. April 2023 (BayMBl. Nr. 194) (§ 1): „Diese Bekanntmachung tritt am 1. Mai 2023 in Kraft.“ – https://www.verkuendung-bayern.de/baymbl/2023-194/, SHA-256 0125c26d242191be…

### BayVV_320_A_570

- Änderung BayMBl. 2025 Nr. 286 (https://www.verkuendung-bayern.de/baymbl/2025-286/, SHA-256 `30f78706c083d7f7…`), verkündet 2025-07-09, in Kraft 2025-08-01 („Diese Bekanntmachung tritt am 1. August 2025 in Kraft.“)
  - s01 `replace-words` in Nr. 1 Satzteil vor Buchst. a: „In dem Satzteil vor Buchst. a wird die Angabe „17 Abs. 1“ durch die Angabe „35 Abs. 3“ ersetzt.“
    - Stichtag: „Aufgrund des § 17 Abs. 1 des Arbeitsgerichtsgesetzes (ArbGG) wird die Zahl …“ · heute: „Aufgrund des § 35 Abs. 3 des Arbeitsgerichtsgesetzes (ArbGG) wird die Zahl …“
  - s02 `replace-words` in Nr. 1 Buchst. a: „In Buchst. a wird die Angabe „12“ durch die Angabe „13“ ersetzt.“
    - Stichtag: „12 Kammern“ · heute: „13 Kammern“
  - s03 `replace-words` in Nr. 1 Buchst. b: „In Buchst. b wird die Angabe „9“ durch die Angabe „10“ ersetzt.“
    - Stichtag: „9 Kammern“ · heute: „10 Kammern“
  - s04 `replace-words` in Nr. 2 Satzteil vor Buchst. a: „In dem Satzteil vor Buchst. a wird die Angabe „35 Abs. 3“ durch die Angabe „17 Abs. 1“ ersetzt.“
    - Stichtag: „Aufgrund des § 35 Abs. 3 ArbGG wird die Zahl der Kammern bei den Arbeitsger…“ · heute: „Aufgrund des § 17 Abs. 1 ArbGG wird die Zahl der Kammern bei den Arbeitsger…“
  - s05 `replace-words` in Nr. 2 Buchst. a: „In Buchst. a wird die Angabe „11“ durch die Angabe „13“ ersetzt.“
    - Stichtag: „11 Kammern“ · heute: „13 Kammern“
  - s06 `replace-words` in Nr. 2 Buchst. b: „In Buchst. b wird die Angabe „5“ durch die Angabe „6“ ersetzt.“
    - Stichtag: „5 Kammern“ · heute: „6 Kammern“
  - s07 `replace-words` in Nr. 2 Buchst. c: „In Buchst. c wird die Angabe „5“ durch die Angabe „6“ ersetzt.“
    - Stichtag: „5 Kammern“ · heute: „6 Kammern“
  - s08 `replace-words` in Nr. 2 Buchst. d: „In Buchst. d wird die Angabe „6“ durch die Angabe „7“ ersetzt.“
    - Stichtag: „6 Kammern“ · heute: „7 Kammern“
  - s09 `replace-words` in Nr. 2 Buchst. e: „In Buchst. e wird die Angabe „47“ durch die Angabe „50“ ersetzt.“
    - Stichtag: „47 Kammern“ · heute: „50 Kammern“
  - s10 `replace-words` in Nr. 2 Buchst. f: „In Buchst. f wird die Angabe „18“ durch die Angabe „20“ ersetzt.“
    - Stichtag: „18 Kammern“ · heute: „20 Kammern“
  - s11 `replace-words` in Nr. 2 Buchst. g: „In Buchst. g wird die Angabe „5“ durch die Angabe „6“ ersetzt.“
    - Stichtag: „5 Kammern“ · heute: „6 Kammern“
  - s12 `replace-words` in Nr. 2 Buchst. h: „In Buchst. h wird die Angabe „10“ durch die Angabe „12“ ersetzt.“
    - Stichtag: „10 Kammern“ · heute: „12 Kammern“
  - s13 `replace-words` in Nr. 2 Buchst. i: „In Buchst. i wird die Angabe „5“ durch die Angabe „6“ ersetzt.“
    - Stichtag: „5 Kammern“ · heute: „6 Kammern“
  - s14 `replace-words` in Nr. 2 Buchst. j: „In Buchst. j wird die Angabe „5“ durch die Angabe „6“ ersetzt.“
    - Stichtag: „5 Kammern“ · heute: „6 Kammern“
  - s15 `replace-words` in Nr. 2 Buchst. k: „In Buchst. k wird die Angabe „12“ durch die Angabe „13“ ersetzt.“
    - Stichtag: „12 Kammern“ · heute: „13 Kammern“
- Beginn der Stichtagsfassung: 2018-11-01 – Inkrafttretensvorschrift im Stichtagstext, 3. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt am 1. November 2018 in Kraft.“

### BayVV_330_A_571

- Änderung BayMBl. 2026 Nr. 225 (https://www.verkuendung-bayern.de/baymbl/2026-225/, SHA-256 `84f9d61db098ecef…`), verkündet 2026-06-03, in Kraft 2026-07-01 („Diese Bekanntmachung tritt am 1. Juli 2026 in Kraft.“)
  - s01 `replace-words` in Nr. 1.1: „In Nr. 1.1 wird die Angabe „7“ durch die Angabe „10“ ersetzt.“
    - Stichtag: „7“ · heute: „10“
- Beginn der Stichtagsfassung: 2018-12-01 – Inkrafttretensvorschrift im Stichtagstext, 2. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt am 1. Dezember 2018 in Kraft.“

### BayVV_7801_L_10736

- Änderung BayMBl. 2025 Nr. 62 (https://www.verkuendung-bayern.de/baymbl/2025-62/, SHA-256 `edd8f4d132aeb929…`), verkündet 2025-02-12, in Kraft 2025-01-21 („Diese Bekanntmachung tritt mit Wirkung vom 21. Januar 2025 in Kraft.“)
  - s01 `recast` in Nr. 3.8 (ganzes Glied aus der Stammverkündung): „Nr. 3.8 Satz 2 wird wie folgt ersetzt: „²Die Personalangelegenheiten sowie die sich hieraus ergebenden Rechtsangelegenheiten nimmt die Landesanstalt für Landwirtschaft in Absprache mit dem TFZ wahr.“ \| In Nr. 3.8 wird folgender neuer Satz 3 eingefügt: „³Die Prüfung der Verwendungsnachweise für vom “
    - Stichtag: „…eitsschutz. ²Die Personalangelegenheiten, die Rechtsangelegenheiten sowie die Prüfung der Verwendungsnachweise nimmt die Landesanstalt für Landwirtschaft in Absprache mit dem TFZ wahr.“ · heute: „…eitsschutz. ²Die Personalangelegenheiten sowie die sich hieraus ergebenden Rechtsangelegenheiten nimmt die Landesanstalt für Landwirtschaft in Absprache mit dem TFZ wahr. ³Die Prüfung der Verwendungsnachweise für vom TFZ bewilligte Projekte sowie die sich hieraus ergebenden Rechtsangelegenheiten nimmt die Staatliche Führungsakademie für Ernährung, Landwirtschaft und Forsten wahr.“
- Beginn der Stichtagsfassung: 2019-12-01 – Inkrafttretensvorschrift im Stichtagstext, 6. Schlussbestimmungen: „Diese Geschäftsordnung tritt mit Wirkung vom 1. Dezember 2019 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2019 Nr. 494 (https://www.verkuendung-bayern.de/baymbl/2019-494/, SHA-256 39f8f4c0298e7194…); Wortlaut gleich (18161 Zeichen, typografisch vereinheitlicht)

### BayVV_7801_L_13600

- Änderung BayMBl. 2026 Nr. 183 (https://www.verkuendung-bayern.de/baymbl/2026-183/, SHA-256 `142dce3a85d68898…`), verkündet 2026-05-06, in Kraft 2026-05-01 („Diese Bekanntmachung tritt mit Wirkung vom 1. Mai 2026 in Kraft.“)
  - s01 `replace-words` in Nr. 1.1 Satz 1: „Die Angabe „dem Bayerischen Staatsministerium für Ernährung, Landwirtschaft und Forsten“ wird durch die Angabe „dem Bayerischen Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…rische Landesanstalt für Landwirtschaft (Landesanstalt) ist dem Bayerischen Staatsministerium für Ernährung, Landwirtsch…“ · heute: „…rische Landesanstalt für Landwirtschaft (Landesanstalt) ist dem Bayerischen Staatsministerium für Ernährung, Landwirtschaft, Forste…“
  - s02 `replace-words` in Nr. 1.1 Satz 2: „Die Angabe „des Bayerischen Staatsministeriums der Finanzen“ wird durch die Angabe „des Bayerischen Staatsministeriums der Finanzen und für Heimat“ ersetzt.“
    - Stichtag: „…²Sie ist Zentralbehörde im Sinn der Verwaltungsvorschriften des Bayerischen Staatsministeriums der Finanzen zur Bayerisc…“ · heute: „…²Sie ist Zentralbehörde im Sinn der Verwaltungsvorschriften des Bayerischen Staatsministeriums der Finanzen und für Heimat zur Bayerisc…“
  - s03 `insert-words` in Nr. 1.3.2 Satz 2: „Nach der Angabe „Haushaltsmitteln“ wird die Angabe „sowie das Qualitätsmanagement“ eingefügt.“
    - Stichtag: „…wachung und Nachweisführung von Stellen und Haushaltsmitteln der Landesanstalt.“ · heute: „…wachung und Nachweisführung von Stellen und Haushaltsmitteln sowie das Qualitätsmanagement der Landesanstalt.“
  - s04 `recast` in Nr. 1.3.4 Satz 3: „Nr. 1.3.4 Satz 3 erhält folgende neue Fassung: „³Das Präsidialbüro ist auch Geschäftsstelle des Beirates der Landesanstalt.““
    - Stichtag: „…sidialbüro ist auch Geschäftsstelle des Verwaltungsrates und des wissenschaftlich-technischen Beirates.“ · heute: „…sidialbüro ist auch Geschäftsstelle des Beirates der Landesanstalt.“
  - s05 `replace-words` in Nr. 1.4 Satz 1 Spiegelstrich 5: „In Spiegelstrich 5 wird die Angabe „das Institut für Tierernährung und Futterwirtschaft“ durch die Angabe „das Institut für Tierhaltung, Tierernährung und Futterwirtschaft“ ersetzt.“
    - Stichtag: „das Institut für Tierernährung und Futterwirtschaft,“ · heute: „das Institut für Tierhaltung, Tierernährung und Futterwirtschaft,“
  - s06 `replace-words` in Nr. 1.4 Satz 1 Spiegelstrich 6: „In Spiegelstrich 6 wird die Angabe „das Institut für Landtechnik und Tierhaltung“ durch die Angabe „das Institut für Landtechnik“ ersetzt.“
    - Stichtag: „das Institut für Landtechnik und Tierhaltung,“ · heute: „das Institut für Landtechnik,“
  - s07 `replace-words` in Nr. 1.4 Satz 1 Spiegelstrich 9: „In Spiegelstrich 9 wird die Angabe „das Institut für Ernährungswirtschaft und Märkte“ durch die Angabe „das Institut für Qualität in der Ernährungswirtschaft“ ersetzt.“
    - Stichtag: „das Institut für Ernährungswirtschaft und Märkte,“ · heute: „das Institut für Qualität in der Ernährungswirtschaft,“
  - s08 `recast` in Nr. 1.5: „Nr. 1.5 erhält folgende neue Fassung: „1.5 Beirat der Landesanstalt ¹Der Beirat unterstützt die Landesanstalt bei grundsätzlichen Entscheidungen. ²Er berät sie in fachlichen Fragen und bringt die Belange der Hochschulen, der Landwirtschaftsberatung sowie der Land- und Ernährungswirtschaft ein. ³Nähe“
    - Stichtag: „1.5 Verwaltungsrat, wissenschaftlich-technischer Beirat und KErn-Beirat ¹Der Verwaltungsrat unterstützt die Landesanstalt bei grundsätzlichen Entscheidungen und kontrolliert ihre Arbeit unbeschadet der Dienst-, Rechts- und Fachaufsicht durch das Staatsministerium. ²Ein wissenschaftlich-technischer B“ · heute: „1.5 Beirat der Landesanstalt ¹Der Beirat unterstützt die Landesanstalt bei grundsätzlichen Entscheidungen. ²Er berät sie in fachlichen Fragen und bringt die Belange der Hochschulen, der Landwirtschaftsberatung sowie der Land- und Ernährungswirtschaft ein. ³Näheres regelt die Geschäftsordnung des Bei“
  - s09 `insert-words` in Nr. 3.1.1 Satz 2: „Nach der Angabe „Entscheidungshilfen“ wird die Angabe „für landwirtschaftliche Betriebe, Beratung und Politik“ eingefügt.“
    - Stichtag: „… praxisgerechte Produktionsverfahren und Entscheidungshilfen, die insbesondere die Aspekte des Umweltschutzes, der Klima…“ · heute: „… praxisgerechte Produktionsverfahren und Entscheidungshilfen für landwirtschaftliche Betriebe, Beratung und Politik, die insbesondere die Aspekte des Umweltschutzes, der Klima…“
  - s10 `replace-words` in Nr. 3.1.1 Satz 2: „Die Angabe „Umweltschutzes“ wird durch die Angabe „Ressourcenschutzes“ ersetzt.“
    - Stichtag: „…ebe, Beratung und Politik, die insbesondere die Aspekte des Umweltschutzes, der Klimaänderung und der Artenvielfalt berü…“ · heute: „…ebe, Beratung und Politik, die insbesondere die Aspekte des Ressourcenschutzes, der Klimaänderung und der Artenvielfalt berü…“
  - s11 `recast` in Nr. 3.1.1 Sätze 4, 5, 6: „Die Sätze 4 bis 6 erhalten folgende neue Fassung: „⁴Das Institut erstellt die fachlichen Leitlinien und unterstützt die Zuständigen des Ressorts bei Hoheitsaufgaben im Bereich des stofflichen und nicht-stofflichen Bodenschutzes, der Düngung sowie in der Landes- und Raumplanung. ⁵Es ist zuständig für“
    - Stichtag: „… erstellt die fachlichen Leitlinien und führt Schulungen im Bereich des Bodenschutzes, der Düngung sowie in der Landes- und Raumplanung durch. ⁵Ihm obliegt die Fachaufsicht über die Düngerechtskontrollen der ÄELF. ⁶Es ist zuständig für die Meldungen und Mitteilungen nach der Verordnung über das Inverkehrbringen und Befördern von Wirtschaftsdünger. ⁷Das Institut koordiniert die Umsetzun…“ · heute: „… erstellt die fachlichen Leitlinien und unterstützt die Zuständigen des Ressorts bei Hoheitsaufgaben im Bereich des stofflichen und nicht-stofflichen Bodenschutzes, der Düngung sowie in der Landes- und Raumplanung. ⁵Es ist zuständig für düngerechtliche Fragestellungen, ausgenommen der Fachrechtskontrollen. ⁶Beim Institut liegt die Fachaufsicht über die Sachgebiete L 2.3 P der ÄELF, soweit sie eige……“
  - s12 `recast` in Nr. 3.1.2 Satz 5: „Nr. 3.1.2 Satz 5 erhält folgende neue Fassung: „⁵Dem Institut obliegen nach Maßgabe des Art. 14 des Gesetzes über Zuständigkeiten und den Vollzug von Rechtsvorschriften im Bereich der Land- und Forstwirtschaft der Vollzug der Vorschriften des Saatgutrechts im Bereich des Anerkennungswesens einschlie“
    - Stichtag: „…m Bereich der Land- und Forstwirtschaft (ZuVLFG) und der §§ 52 und 52c der Zuständigkeitsverordnung (ZustV) der Vollzug der Vorschriften des Saatgutrechts sowie des Pflanzenschutz- und Düngemittelrechts im Bereich der Verkehrs- und Betriebskontrollen einschließlich der dazu notwendigen fac…“ · heute: „…m Bereich der Land- und Forstwirtschaft der Vollzug der Vorschriften des Saatgutrechts im Bereich des Anerkennungswesens einschließlich der dazu notwendigen fac…“
  - s13 `recast` in Nr. 3.1.5: „Nr. 3.1.5 erhält folgende neue Fassung: „3.1.5 Institut für Tierhaltung, Tierernährung und Futterwirtschaft ¹Das Institut befasst sich mit der tier- und bedarfsgerechten, umweltverträglichen, tierwohlorientierten sowie tiergesundheitsfördernden konventionellen und ökologischen Haltung und Fütterung “
    - Stichtag: „3.1.5 Institut für Tierernährung und Futterwirtschaft ¹Das Institut befasst sich mit der bedarfsgerechten, umweltverträglichen, tierwohlorientierten, ökologischen und tiergesundheitsfördernden Fütterung landwirtschaftlicher Nutztiere mit dem Ziel der nachhaltigen Erzeugung von Milch, Fleisch und Eie“ · heute: „3.1.5 Institut für Tierhaltung, Tierernährung und Futterwirtschaft ¹Das Institut befasst sich mit der tier- und bedarfsgerechten, umweltverträglichen, tierwohlorientierten sowie tiergesundheitsfördernden konventionellen und ökologischen Haltung und Fütterung landwirtschaftlicher Nutztiere mit dem Zi“
  - s14 `recast` in Nr. 3.1.6: „Nr. 3.1.6 erhält folgende neue Fassung: „3.1.6 Institut für Landtechnik ¹Das Institut betreibt angewandte Forschung im Bereich der Mechanisierung, Automatisierung und Digitalisierung von landwirtschaftlichen Produktionsverfahren mit dem Ziel, neue Technologien und Verfahren zu entwickeln, zu erprobe“
    - Stichtag: „3.1.6 Institut für Landtechnik und Tierhaltung ¹Das Institut betreibt angewandte Forschung im Bereich der Mechanisierung von landwirtschaftlichen Produktionsverfahren und der Haltung von landwirtschaftlichen Nutztieren mit dem Ziel, neue Technologien und Verfahren zu entwickeln, zu erproben und zu b“ · heute: „3.1.6 Institut für Landtechnik ¹Das Institut betreibt angewandte Forschung im Bereich der Mechanisierung, Automatisierung und Digitalisierung von landwirtschaftlichen Produktionsverfahren mit dem Ziel, neue Technologien und Verfahren zu entwickeln, zu erproben und zu bewerten. ²Schwerpunkte sind die“
  - s15 `recast` in Nr. 3.1.8: „Nr. 3.1.8 erhält folgende neue Fassung: „3.1.8 Institut für Agrarökonomie ¹Das Institut befasst sich mit der Existenzsicherung und Weiterentwicklung landwirtschaftlicher Unternehmen, der Analyse und Planung ländlicher Strukturprozesse und der Anpassung der Landwirtschaft an sich ändernde politische “
    - Stichtag: „3.1.8 Institut für Agrarökonomie ¹Das Institut befasst sich mit der Sicherung landwirtschaftlicher Existenzen, der Planung ländlicher Strukturprozesse und der Anpassung der Landwirtschaft an sich ändernde politische und gesamtwirtschaftliche Rahmenbedingungen. ²Es erarbeitet Informationen zur Wirtsc“ · heute: „3.1.8 Institut für Agrarökonomie ¹Das Institut befasst sich mit der Existenzsicherung und Weiterentwicklung landwirtschaftlicher Unternehmen, der Analyse und Planung ländlicher Strukturprozesse und der Anpassung der Landwirtschaft an sich ändernde politische und gesamtwirtschaftliche Rahmenbedingung“
  - s16 `recast` in Nr. 3.1.9: „Nr. 3.1.9 erhält folgende neue Fassung: „3.1.9 Institut für Qualität in der Ernährungswirtschaft ¹Das Institut ist für den Vollzug der einschlägigen Rechts- und Verwaltungsvorschriften des landwirtschaftlichen Marktwesens zuständig. ²Dieser umfasst die gemeinsame Marktordnung in den Sektoren Obst un“
    - Stichtag: „3.1.9 Institut für Ernährungswirtschaft und Märkte ¹Das Institut befasst sich mit der Beobachtung und Analyse der Märkte der Land- und Ernährungswirtschaft. ²Ein Schwerpunkt liegt in der Marktinformation und Marktberichterstattung. ³Es ist für den Vollzug der einschlägigen Rechts- und Verwaltungsvor“ · heute: „3.1.9 Institut für Qualität in der Ernährungswirtschaft ¹Das Institut ist für den Vollzug der einschlägigen Rechts- und Verwaltungsvorschriften des landwirtschaftlichen Marktwesens zuständig. ²Dieser umfasst die gemeinsame Marktordnung in den Sektoren Obst und Gemüse, Fleisch, Fisch, Eier und Geflüg“
  - s17 `recast` in Nr. 1.3.1 (ganzes Glied aus der Stammverkündung): „Der bisherige Satz 8 wird gestrichen. \| Es werden folgende neue Sätze 8 und 9 eingefügt: „⁸Der Präsident arbeitet mit dem Beirat der Landesanstalt vertrauensvoll zusammen. ⁹Er ist Mitglied im Strategierat des Staatsbetriebs Bayerische Staatsgüter (BaySG) und informiert diese über wesentliche Sachve“
    - Stichtag: „…denten bestellt das Staatsministerium. ⁸Er arbeitet mit dem Verwaltungsrat vertrauensvoll zusammen und führt den Vorsitz im wissenschaftlich-technischen Beirat. ⁹Der Präsident ist Dienstvorgesetzter der Beamtinnen und Beamten. ¹⁰Gegenüber den Arbeitnehmerinnen und Arbeitnehmern nimmt er im Rahmen der ihm übertragenen arbeitsrechtlichen Zuständigkeiten die Befugnisse des Arbeitgebers wahr. ¹¹Mit de……“ · heute: „…denten bestellt das Staatsministerium. ⁸Der Präsident arbeitet mit dem Beirat der Landesanstalt vertrauensvoll zusammen. ⁹Er ist Mitglied im Strategierat des Staatsbetriebs Bayerische Staatsgüter (BaySG) und informiert diese über wesentliche Sachverhalte an der Landesanstalt, die auch die BaySG betreffen. ¹⁰Der Präsident ist Dienstvorgesetzter der Beamtinnen und Beamten. ¹¹Gegenüber den Arbeitnehm……“
  - s18 `recast` in Nr. 1.3.7 (ganzes Glied aus der Stammverkündung): „Nach dem dritten Spiegelstrich wird folgender neuer Spiegelstrich eingefügt: „– den Ansprechpartner für Korruptionsvorsorge,“ \| Im bisherigen Spiegelstrich 8 wird die Angabe „und“ durch ein Komma ersetzt. \| Im bisherigen Spiegelstrich 9 wird der Punkt durch ein Komma ersetzt. \| Nach dem letzten S“
    - Stichtag: „…r Verordnung (EU) 2016/679 (Datenschutz- Grundverordnung), – den Informationssicherheitsbeauftragten, – die Gleichstellungsbeauftragte nach Art. 15 des Bayerischen Gleichstellungsgesetzes (BayGlG), – den Inklusionsbeauftragten des Arbeitgebers nach § 181 des Neunten Buches Sozialgesetzbuch (SGB IX), – die Betriebsärzte und Fachkräfte für Arbeitssicherheit nach den §§ 2 und 5 des Gesetzes über Betr……“ · heute: „…r Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung), – den Informationssicherheitsbeauftragten, – den Ansprechpartner für Korruptionsvorsorge, – die Gleichstellungsbeauftragte nach Art. 15 des Bayerischen Gleichstellungsgesetzes (BayGlG), – den Inklusionsbeauftragten des Arbeitgebers nach § 181 des Neunten Buches Sozialgesetzbuch (SGB IX), – die Betriebsärzte und Fachkräfte für Arbeitssicherh……“
  - s19 `recast` in Nr. 2 (ganzes Glied aus der Stammverkündung): „Vor der Angabe „Sicherung“ wird die Angabe „die“ gestrichen und vor der Angabe „Erhaltung“ die Angabe „sowie die“ durch ein Komma ersetzt. \| Die Angabe „Bayerische Staatsgüter“ wird durch die Angabe „BaySG“ ersetzt. \| Die Angabe „LWG“ wird durch die Angabe „Landesanstalt für Weinbau und Gartenbau,“
    - Stichtag: „…eistern als Partner der Landwirtschaft, die Sicherung und Weiterentwicklung einer umweltverträglichen und tiergerechten Landwirtschaft sowie die Erhaltung einer funktionstüchtigen Kulturlandschaft und Versorgung der Bevölkerung mit sicheren und hochwertigen Nahrungsmitteln und Rohstoffen. 2.1 Anwendungsorientierte Forschung und Entwicklung, Versuche ¹Als Grundlage für Hoheitsvollzug, Beratung und ……“ · heute: „…eistern als Partner der Landwirtschaft, Sicherung und Weiterentwicklung einer umweltverträglichen und tiergerechten Landwirtschaft, Erhaltung einer funktionstüchtigen Kulturlandschaft und Versorgung der Bevölkerung mit sicheren und hochwertigen Nahrungsmitteln und Rohstoffen. 2.1 Anwendungsorientierte Forschung und Entwicklung, Versuche ¹Als Grundlage für Hoheitsvollzug, Beratung und Bildung, Info……“
  - s20 `recast` in Nr. 3.1.3 (ganzes Glied aus der Stammverkündung): „Nach der Angabe „Pflanzengesundheitsrechts“ wird ein Komma eingefügt und die Angabe „(ausgenommen Verkehrs- und Betriebskontrollen)“ durch die Angabe „ausgenommen Verkehrs- und Betriebskontrollen“ ersetzt. \| Es wird folgender neuer Satz 5 eingefügt: „⁵Beim Institut liegt die Fachaufsicht über die S“
    - Stichtag: „…chutz- und des Pflanzengesundheitsrechts (ausgenommen Verkehrs- und Betriebskontrollen). ³Schwerpunkte sind die Überwachung der Pflanzenbestände auf das Auftreten von Schadorganismen, die Diagnose von Krankheiten und Schädlingen, die Überwachung der Einfuhr und der Ausfuhr von Pflanzen, die Überwachung von Quarantäneschadorganismen, die Genehmigung und Kontrolle der Anwendung von Pflanzenschutzmit…“ · heute: „…chutz- und des Pflanzengesundheitsrechts, ausgenommen Verkehrs- und Betriebskontrollen. ³Schwerpunkte sind die Überwachung der Pflanzenbestände auf das Auftreten von Schadorganismen, die Diagnose von Krankheiten und Schädlingen, die Überwachung der Einfuhr und der Ausfuhr von Pflanzen, die Überwachung von Quarantäneschadorganismen, die Genehmigung und Kontrolle der Anwendung von Pflanzenschutzmitt…“
  - s21 `recast` in Nr. 3.1.10 (ganzes Glied aus der Stammverkündung): „Nach der Angabe „Bevölkerung“ wird das Komma durch die Angabe „sowie“ ersetzt. \| Nach der Angabe „Ausbau“ wird die Angabe „sowie“ durch die Angabe „und“ ersetzt.“
    - Stichtag: „…nsmitteln in der bayerischen Bevölkerung, der Auf- und Ausbau sowie die Stärkung regionaler Wertschöpfungsk…“ · heute: „…nsmitteln in der bayerischen Bevölkerung sowie der Auf- und Ausbau und die Stärkung regionaler Wertschöpfungsk…“
- Beginn der Stichtagsfassung: 2023-02-01 – Inkrafttretensvorschrift im Stichtagstext, 6. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt mit Wirkung vom 1. Februar 2023 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2023 Nr. 90 (https://www.verkuendung-bayern.de/baymbl/2023-90/, SHA-256 f904090ec1972149…); Wortlaut gleich (36404 Zeichen, typografisch vereinheitlicht)

### BayVV_8113_0_A_12472

- Änderung BayMBl. 2024 Nr. 579 (https://www.verkuendung-bayern.de/baymbl/2024-579/, SHA-256 `0c7296052c800e15…`), verkündet 2024-11-27, in Kraft 2024-12-31 („Diese Bekanntmachung tritt am 31. Dezember 2024 in Kraft.“)
  - s01 `insert-words` in Nr. 2.1: „In Nr. 2.1 werden nach den Wörtern „Einrichtungen mit“ die Wörter „in der Regel“ eingefügt.“
    - Stichtag: „Komplexeinrichtungen sind mehrgliedrige Einrichtungen mit mehr als 100 Bewohnerinnen und Bewohnern, die mehrere unter…“ · heute: „Komplexeinrichtungen sind mehrgliedrige Einrichtungen mit in der Regel mehr als 100 Bewohnerinnen und Bewohnern, die mehrere unter…“
  - s02 `insert-sentence` in Nr. 5.7: „Der Nr. 5.7 wird folgender Satz 3 angefügt: „³Soweit dadurch die Anzahl der Bewohnerinnen und Bewohner am Stammstandort der Komplexeinrichtung unterschritten wird (vergleiche Nr. 2.1), ist dies für weitere Förderungen, die der weiteren Umsetzung der Konversion desselben Vorhabenträgers dienen, unsch“
    - Stichtag: „(Satz fehlt)“ · heute: „³Soweit dadurch die Anzahl der Bewohnerinnen und Bewohner am Stammstandort der Komplexeinrichtung unterschritten wird (vergleiche Nr. 2.1), ist dies für weitere Förderungen, die der weiteren Umsetzung“
  - s03 `replace-words` in Nr. 7.6 Spiegelstrich 1: „In Spiegelstrich 1 wird die Angabe „4 400“ durch die Angabe „5 300“ ersetzt.“
    - Stichtag: „für Werkstattbeschäftigte 4 400 €,“ · heute: „für Werkstattbeschäftigte 5 300 €,“
  - s04 `replace-words` in Nr. 7.6 Spiegelstrich 2: „In Spiegelstrich 2 wird die Angabe „5 000“ durch die Angabe „6 000“ ersetzt.“
    - Stichtag: „für Leistungsberechtigte in Förderstätten 5 000 €,“ · heute: „für Leistungsberechtigte in Förderstätten 6 000 €,“
  - s05 `replace-words` in Nr. 7.6 Spiegelstrich 3: „In Spiegelstrich 3 wird die Angabe „5 700“ durch die Angabe „6 900“ ersetzt.“
    - Stichtag: „mit integrierter Tagesstruktur 5 700 €.“ · heute: „mit integrierter Tagesstruktur 6 900 €.“
  - s06 `recast` in Nr. 12: „Nr. 12 wird wie folgt gefasst: „12. Prüfung des Verwendungsnachweises Der Nachweis der Verwendung ist von den Zuwendungsempfängern nach Nr. 4 entsprechend der Vorgaben der VV Nr. 10 zu Art. 44 BayHO in Verbindung mit Nr. 6 ANBest-P (im Bewilligungsbescheid) zu verlangen / oder zu führen.““
    - Stichtag: „12. Prüfung des Verwendungsnachweises Der Nachweis der Verwendung ist durch die in VV Nr. 10 zu Art. 44 BayHO festgelegte Stelle nach den Vorgaben der VV Nr. 11 zu Art. 44 BayHO in Verbindung mit Nr. 6 ANBest-P zu führen.“ · heute: „12. Prüfung des Verwendungsnachweises Der Nachweis der Verwendung ist von den Zuwendungsempfängern nach Nr. 4 entsprechend der Vorgaben der VV Nr. 10 zu Art. 44 BayHO in Verbindung mit Nr. 6 ANBest-P (im Bewilligungsbescheid) zu verlangen / oder zu führen.“
  - s07 `replace-words` in Nr. 14: „In Nr. 14 wird die Angabe „Zuschussempfängern“ durch die Angabe „Zuwendungsempfängern“ ersetzt.“
    - Stichtag: „…gemäß Art. 91 Abs. 1 Satz 1 Nr. 3 BayHO berechtigt, bei den Zuschussempfängern zu prüfen.“ · heute: „…gemäß Art. 91 Abs. 1 Satz 1 Nr. 3 BayHO berechtigt, bei den Zuwendungsempfängern zu prüfen.“
  - s08 `replace-words` in Nr. 16: „In Nr. 16 wird die Angabe „2024“ durch die Angabe „2028“ ersetzt.“
    - Stichtag: „…Oktober 2021 in Kraft und tritt mit Ablauf des 31. Dezember 2024 außer Kraft.“ · heute: „…Oktober 2021 in Kraft und tritt mit Ablauf des 31. Dezember 2028 außer Kraft.“
- Beginn der Stichtagsfassung: 2021-10-21 – Inkrafttretensvorschrift im Stichtagstext, 16. Inkrafttreten; Außerkrafttreten: „Diese Richtlinie tritt am 21. Oktober 2021 in Kraft und tritt mit Ablauf des 31. Dezember 2024 außer Kraft.“ · Außerkrafttreten der Norm erst 2024-12-31, nach dem Stichtag: „Diese Richtlinie tritt am 21. Oktober 2021 in Kraft und tritt mit Ablauf des 31. Dezember 2024 außer Kraft“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung BayMBl. 2021 Nr. 738 (https://www.verkuendung-bayern.de/baymbl/2021-738/, SHA-256 323f3771468c07aa…); Wortlaut gleich (15600 Zeichen, typografisch vereinheitlicht)

### BayVV_8113_1_A_11725

- Änderung BayMBl. 2023 Nr. 618 (https://www.verkuendung-bayern.de/baymbl/2023-618/, SHA-256 `ad26c3a8526d89c7…`), verkündet 2023-12-13, in Kraft 2023-12-31 („Diese Bekanntmachung tritt am 31. Dezember 2023 in Kraft.“)
  - s01 `insert-block` in Nr. 6 Nr. 6.7: „Der Nr. 6 wird folgende Nr. 6.7 angefügt: „6.7 Im Rahmen von Veröffentlichungen und in öffentlicher Kommunikation im Zusammenhang mit dem Förderprogramm sowie in direkter Kommunikation mit Antragstellern und Antragstellerinnen ist ausdrücklich darauf hinzuweisen, dass Zuwendungen aus dem Programm fr“
    - Stichtag: „(Glied fehlt)“ · heute: „6.7 Im Rahmen von Veröffentlichungen und in öffentlicher Kommunikation im Zusammenhang mit dem Förderprogramm sowie in direkter Kommunikation mit Antragstellern und Antragstellerinnen ist ausdrücklich“
  - s02 `replace-words` in Nr. 11: „In Nr. 11 wird die Angabe „2023“ durch die Angabe „2026“ ersetzt.“
    - Stichtag: „…Januar 2021 in Kraft; sie tritt mit Ablauf des 31. Dezember 2023 außer Kraft.“ · heute: „…Januar 2021 in Kraft; sie tritt mit Ablauf des 31. Dezember 2026 außer Kraft.“
- Beginn der Stichtagsfassung: 2021-01-01 – Inkrafttretensvorschrift im Stichtagstext, 11. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt mit Wirkung vom 1. Januar 2021 in Kraft; sie tritt mit Ablauf des 31. Dezember 2023 außer Kraft.“ · Außerkrafttreten der Norm erst 2023-12-31, nach dem Stichtag: „Diese Bekanntmachung tritt mit Wirkung vom 1. Januar 2021 in Kraft; sie tritt mit Ablauf des 31. Dezember 2023 außer Kraft“

### BayVertrV

- Änderung GVBl. 2026 S. 146 (https://www.verkuendung-bayern.de/gvbl/2026-146/, SHA-256 `92c96e2cb2e9e9f2…`), verkündet 2026-03-31, in Kraft 2026-04-01 („Diese Verordnung tritt am 1. April 2026 in Kraft.“)
  - a1-s01 `replace-words` in § 2 Abs. 1 Satz 2 Nr. 3 Buchst. c: „In Abs. 1 Satz 2 Nr. 3 Buchst. c wird die Angabe „München“ durch die Angabe „Landshut (Bearbeitungsstelle München)“ ersetzt.“
    - Stichtag: „Dienststelle München für den Regierungsbezirk Oberbayern mit Ausnahme der…“ · heute: „Dienststelle Landshut (Bearbeitungsstelle München) für den Regierungsbezirk Oberbayern mit Ausnahme der…“
  - a1-s02 `replace-words` in § 2 Abs. 2 Satzteil vor Nr. 1: „In dem Satzteil vor Nr. 1 wird die Angabe „München“ durch die Angabe „Landshut (Bearbeitungsstelle München)“ ersetzt.“
    - Stichtag: „Dem Landesamt für Finanzen – Dienststelle München – obliegt die Vertretung für“ · heute: „Dem Landesamt für Finanzen – Dienststelle Landshut (Bearbeitungsstelle München) – obliegt die Vertretung für“
  - a1-s03 `replace-words` in § 2 Abs. 2 Nr. 1: „Die Angabe „München“ wird durch die Angabe „Landshut“ ersetzt.“
    - Stichtag: „…keiten, bei denen das Landesamt für Finanzen – Dienststelle München – gemäß § 1 Abs. 5 Satz 1 Nr. 2 Buchst. b der Verord…“ · heute: „…keiten, bei denen das Landesamt für Finanzen – Dienststelle Landshut – gemäß § 1 Abs. 5 Satz 1 Nr. 2 Buchst. b der Verord…“
  - a1-s04 `delete-words` in § 2 Abs. 2 Nr. 1 (Stelle nach dem umgebenden Wortlaut der Verkündung): „Die Angabe „Buchst. b“ wird gestrichen.“
    - Stichtag: „…andshut – gemäß § 1 Abs. 5 Satz 1 Nr. 2 Buchst. b der Verordnung über das Landesamt für Fi…“ · heute: „…andshut – gemäß § 1 Abs. 5 Satz 1 Nr. 2 der Verordnung über das Landesamt für Fi…“
  - a1-s05 `replace-words` in § 2 Abs. 6: „In Abs. 6 wird die Angabe „München“ durch die Angabe „Landshut (Bearbeitungsstelle München)“ ersetzt.“
    - Stichtag: „…r. 3 für den Regierungsbezirk Niederbayern die Dienststelle München und für den Regierungsbezirk Oberpfalz die Dienstste…“ · heute: „…r. 3 für den Regierungsbezirk Niederbayern die Dienststelle Landshut (Bearbeitungsstelle München) und für den Regierungsbezirk Oberpfalz die Dienstste…“
  - a1-s06 `number-sentences` in § 2 Abs. 7: „Der Wortlaut wird Satz 1.“
    - Stichtag: „(ohne Satznummer)“ · heute: „¹“
  - a1-s07 `insert-sentence` in § 2 Abs. 7: „Folgender Satz 2 wird angefügt: „²Im Falle der Dienststelle Landshut gilt hiervon abweichend für die Zwecke dieser Verordnung die Bearbeitungsstelle München, soweit ihr die Vertretung obliegt, als Behörde im Sinne des § 18 ZPO.““
    - Stichtag: „(Satz fehlt)“ · heute: „²Im Falle der Dienststelle Landshut gilt hiervon abweichend für die Zwecke dieser Verordnung die Bearbeitungsstelle München, soweit ihr die Vertretung obliegt, als Behörde im Sinne des § 18 ZPO.“
  - a1-s08 `replace-words` in § 3 Abs. 2 Satz 2: „In § 3 Abs. 2 Satz 2 und § 6 Satz 1 Nr. 3 Halbsatz 1 wird jeweils die Angabe „München“ durch die Angabe „Landshut (Bearbeitungsstelle München)“ ersetzt.“
    - Stichtag: „…halb Bayerns, ist das Landesamt für Finanzen – Dienststelle München – zuständig.“ · heute: „…halb Bayerns, ist das Landesamt für Finanzen – Dienststelle Landshut (Bearbeitungsstelle München) – zuständig.“
  - a1-s09 `replace-words` in § 6 Satz 1 Nr. 3 Halbsatz 1: „In § 3 Abs. 2 Satz 2 und § 6 Satz 1 Nr. 3 Halbsatz 1 wird jeweils die Angabe „München“ durch die Angabe „Landshut (Bearbeitungsstelle München)“ ersetzt.“
    - Stichtag: „im Übrigen durch das Landesamt für Finanzen – Dienststelle München; dies gilt auch für die Vertretung des Freistaates B…“ · heute: „im Übrigen durch das Landesamt für Finanzen – Dienststelle Landshut (Bearbeitungsstelle München); dies gilt auch für die Vertretung des Freistaates B…“
- Änderung GVBl. 2025 S. 570 (https://www.verkuendung-bayern.de/gvbl/2025-570/, SHA-256 `1390fee5c42d9579…`), verkündet 2025-11-28, in Kraft 2025-12-31 („Dieses Gesetz tritt am 31. Dezember 2025 in Kraft.“)
  - a2-s01 `repeal-unit` in § 6 Satz 1 Nr. 1 Buchst. c: „Buchst. c wird aufgehoben.“
    - Stichtag: „c) nach dem Bayerischen Familiengeldgesetz,“ · heute: „c) (aufgehoben)“
  - a2-s02 `repeal-unit` in § 6 Satz 1 Nr. 1 Buchst. h: „Buchst. h wird aufgehoben.“
    - Stichtag: „h) im Sinne des Art. 23a des Bayerischen Kinderbildungs- und –betreuungsgesetzes,“ · heute: „(aufgehoben)“
  - a2-s03 `relabel` in § 6 Satz 1 Nr. 1 Buchst. i → Buchst. h: „Die Buchst. i und j werden die Buchst. h und i.“
    - Stichtag: „i)“ · heute: „h)“
  - a2-s04 `relabel` in § 6 Satz 1 Nr. 1 Buchst. j → Buchst. i: „Die Buchst. i und j werden die Buchst. h und i.“
    - Stichtag: „j)“ · heute: „i)“
  - a2-s05 `insert-block` in § 12: „Vor § 12 wird folgender § 12 eingefügt: „§ 12 Übergangsvorschriften ¹Auf Angelegenheiten nach dem Bayerischen Familiengeldgesetz (BayFamGG) in der am 30. Dezember 2025 geltenden Fassung ist § 6 Satz 1 Nr. 1 Buchst. c in der am 30. Dezember 2025 geltenden Fassung weiter anzuwenden. ²Auf Angelegenheit“
    - Stichtag: „(Glied fehlt)“ · heute: „§ 12 Übergangsvorschriften ¹Auf Angelegenheiten nach dem Bayerischen Familiengeldgesetz (BayFamGG) in der am 30. Dezember 2025 geltenden Fassung ist § 6 Satz 1 Nr. 1 Buchst. c in der am 30. Dezember 2“
  - a2-s06 `relabel` in § 12 → § 13: „Der bisherige § 12 wird § 13.“
    - Stichtag: „§ 12“ · heute: „§ 13“
- Beginn der Stichtagsfassung: 2021-12-01 – Inkrafttretensvorschrift im Stichtagstext, § 12 Inkrafttreten, Außerkrafttreten: „Diese Verordnung tritt am 1. Dezember 2021 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung GVBl. 2021 S. 610 (https://www.verkuendung-bayern.de/gvbl/2021-610/, SHA-256 bc724bc5a1bb8c8a…); Wortlaut gleich (21408 Zeichen, typografisch vereinheitlicht)

### BayVfV

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in § 4 Abs. 3: „In § 4 Abs. 3 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
    - Stichtag: „…, der Finanzen und für Heimat, für Ernährung, Landwirtschaft und Forsten und für Familie, Arbeit und Soziales sowie alle…“ · heute: „…, der Finanzen und für Heimat, für Ernährung, Landwirtschaft, Forsten und Tourismus und für Familie, Arbeit und Soziales sowie alle…“
- Beginn der Stichtagsfassung: 2019-11-01 – Vorangehende Änderung § 6 der Verordnung vom 1. Oktober 2019 (GVBl. S. 594): „Diese Verordnung tritt am 1. November 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-594/, SHA-256 e5a91a05dea859d8…

### BayVwV101445

- Änderung BayMBl. 2026 Nr. 167 (https://www.verkuendung-bayern.de/baymbl/2026-167/, SHA-256 `f204e627fa4fa22a…`), verkündet 2026-04-29, in Kraft 2026-04-30 („Diese Änderungssatzung tritt am Tag nach ihrer Bekanntmachung in Kraft. Verkündungsdatum 2026-04-29 laut Verkündung selbst (https://www.verkuendung-bayern.de/baymbl/2026-167/)“)
  - s01 `insert-block` in § 5 Abs. 4: „Dem § 5 wird folgender Abs. 4 angefügt: „(4) Die Mitglieder des Vorstands sind von den Beschränkungen des § 181 Alternative 2 des Bürgerlichen Gesetzbuchs (BGB) befreit.““
    - Stichtag: „(Glied fehlt)“ · heute: „(4) Die Mitglieder des Vorstands sind von den Beschränkungen des § 181 Alternative 2 des Bürgerlichen Gesetzbuchs (BGB) befreit.“
- Beginn der Stichtagsfassung: 2020-11-26 – Vorangehende Änderung vom 12. November 2020 (BayMBl. Nr. 678, Nr. 806) (§ 1): „Diese Änderungssatzung tritt am 26. November 2020 in Kraft.“ – https://www.verkuendung-bayern.de/baymbl/2020-678/, SHA-256 60289c8c5430d552…

### BayVwV319722

- Änderung BayMBl. 2025 Nr. 4 (https://www.verkuendung-bayern.de/baymbl/2025-4/, SHA-256 `741329ef2fffb612…`), verkündet 2025-01-08, in Kraft 2025-01-09 („Diese Bekanntmachung tritt am 9. Januar 2025 in Kraft.“)
  - s01 `insert-block` in Nr. 10: „Nach Nr. 9 wird folgende Nr. 10 eingefügt: „10. Vollzugshinweise zur Anwendung der BayKompV bei Freileitungen Das Staatsministerium für Umwelt und Verbraucherschutz erlässt im Einvernehmen mit den Staatsministerien für Wohnen, Bau und Verkehr, für Ernährung, Landwirtschaft, Forsten und Tourismus sow“
    - Stichtag: „(Glied fehlt)“ · heute: „10. Vollzugshinweise zur Anwendung der BayKompV bei Freileitungen Das Staatsministerium für Umwelt und Verbraucherschutz erlässt im Einvernehmen mit den Staatsministerien für Wohnen, Bau und Verkehr, “
  - s02 `relabel` in Nr. 11 → Nr. 12: „Die bisherigen Nrn. 10 und 11 werden die Nrn. 11 und 12.“
    - Stichtag: „11.“ · heute: „12.“
  - s03 `relabel` in Nr. 10 → Nr. 11: „Die bisherigen Nrn. 10 und 11 werden die Nrn. 11 und 12.“
    - Stichtag: „10.“ · heute: „11.“
- Beginn der Stichtagsfassung: 2022-10-01 – Vorangehende Änderung vom 30. September 2022 (BayMBl. Nr. 585, Nr. 694) (Nr. 1): „Diese Bekanntmachung tritt am 1. Oktober 2022 in Kraft.“ – https://www.verkuendung-bayern.de/baymbl/2022-585/, SHA-256 410a66d450770cc2…

### BayWoBindG

- Änderung GVBl. 2024 S. 265 (https://www.verkuendung-bayern.de/gvbl/2024-265/, SHA-256 `c54079441a5d1b6a…`), verkündet 2024-07-30, in Kraft 2024-08-01 („Dieses Gesetz tritt am 1. August 2024 in Kraft.“)
  - s01 `replace-words` in Art. 4 Überschrift: „In der Überschrift wird das Wort „Verordnungsermächtigung“ durch das Wort „Verordnungsermächtigungen“ ersetzt.“
    - Stichtag: „Erteilung des Wohnberechtigungsscheins, Verordnungsermächtigung“ · heute: „Erteilung des Wohnberechtigungsscheins, Verordnungsermächtigungen“
  - s02 `replace-words` in Art. 4 Abs. 1 Satz 2 Halbsatz 1 Nr. 1: „In Nr. 1 wird die Angabe „14 000 €“ durch die Angabe „17 500 €“ ersetzt.“
    - Stichtag: „für einen Einpersonenhaushalt 14 000 €,“ · heute: „für einen Einpersonenhaushalt 17 500 €,“
  - s03 `replace-words` in Art. 4 Abs. 1 Satz 2 Halbsatz 1 Nr. 2: „In Nr. 2 wird die Angabe „22 000 €“ durch die Angabe „27 500 €“ ersetzt.“
    - Stichtag: „für einen Zweipersonenhaushalt 22 000 €,“ · heute: „für einen Zweipersonenhaushalt 27 500 €,“
  - s04 `replace-words` in Art. 4 Abs. 1 Satz 2 Halbsatz 1 Satzteil nach Nr. 2: „Im Satzteil nach Nr. 2 wird die Angabe „4 000 €“ durch die Angabe „5 000 €“ ersetzt.“
    - Stichtag: „zum Haushalt rechnende Person 4 000 €;“ · heute: „zum Haushalt rechnende Person 5 000 €;“
  - s05 `insert-words` in Art. 4 Abs. 1 Satz 3: „In Satz 3 wird nach dem Wort „Einkommensteuergesetzes“ die Angabe „(EStG)“ eingefügt und die Angabe „1 000 €“ durch die Angabe „1 300 €“ ersetzt.“
    - Stichtag: „…nd im Sinn des § 32 Abs. 1 bis 5 des Einkommensteuergesetzes um weitere 1 000 €. ⁴Gleiches gilt, wenn die Geburt eines K…“ · heute: „…nd im Sinn des § 32 Abs. 1 bis 5 des Einkommensteuergesetzes (EStG) um weitere 1 000 €. ⁴Gleiches gilt, wenn die Geburt eines K…“
  - s06 `replace-words` in Art. 4 Abs. 1 Satz 3: „In Satz 3 wird nach dem Wort „Einkommensteuergesetzes“ die Angabe „(EStG)“ eingefügt und die Angabe „1 000 €“ durch die Angabe „1 300 €“ ersetzt.“
    - Stichtag: „… Abs. 1 bis 5 des Einkommensteuergesetzes (EStG) um weitere 1 000 €. ⁴Gleiches gilt, wenn die Geburt eines Kindes oder m…“ · heute: „… Abs. 1 bis 5 des Einkommensteuergesetzes (EStG) um weitere 1 300 €. ⁴Gleiches gilt, wenn die Geburt eines Kindes oder m…“
  - s07 `insert-block` in Art. 4 Abs. 2: „Nach Abs. 1 wird folgender Abs. 2 eingefügt: „(2) ¹Das Staatsministerium wird ermächtigt, im Einvernehmen mit dem Staatsministerium der Finanzen und für Heimat durch Rechtsverordnung die in Abs. 1 genannten Einkommenshöchstgrenzen anzupassen, wenn dies unter Berücksichtigung der allgemeinen Einkomme“
    - Stichtag: „(Glied fehlt)“ · heute: „(2) ¹Das Staatsministerium wird ermächtigt, im Einvernehmen mit dem Staatsministerium der Finanzen und für Heimat durch Rechtsverordnung die in Abs. 1 genannten Einkommenshöchstgrenzen anzupassen, wen“
  - s08 `relabel` in Art. 4 Abs. 2 → Abs. 3: „Der bisherige Abs. 2 wird Abs. 3.“
    - Stichtag: „(2)“ · heute: „(3)“
  - s09 `replace-words` in Art. 5 Satz 3 Halbsatz 1: „In Art. 5 Satz 3 Halbsatz 1 wird die Angabe „7“ durch die Angabe „6“ ersetzt.“
    - Stichtag: „… zu benennen. ³Bei der Benennung sind ungeachtet des Satzes 7 insbesondere schwangere Frauen, Familien und andere Hausha…“ · heute: „… zu benennen. ³Bei der Benennung sind ungeachtet des Satzes 6 insbesondere schwangere Frauen, Familien und andere Hausha…“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 267 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayZAPOhGesD

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in § 2 Abs. 2: „In § 2 Abs. 2 werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „Das Staatsministerium für Gesundheit und Pflege (Staatsministerium) kann in Einzelfällen im Inte…“ · heute: „Das Staatsministerium für Gesundheit, Pflege und Prävention (Staatsministerium) kann in Einzelfällen im Inte…“
- Beginn der Stichtagsfassung: 2021-01-01 – Vorangehende Änderung vom 17. November 2020 (GVBl. S. 647) (§ 1): „Diese Verordnung tritt am 1. Januar 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-647/, SHA-256 1988afef16eed976…

### BayZEPRV

- Änderung GVBl. 2026 S. 75 (https://www.verkuendung-bayern.de/gvbl/2026-75/, SHA-256 `97a4022d212061fa…`), verkündet 2026-03-31, in Kraft 2026-04-01 („Dieses Gesetz tritt am 1. April 2026 in Kraft.“)
  - s01 `replace-words` in § 3 Abs. 1 Satz 1: „In § 3 Abs. 1 Satz 1 wird die Angabe „durch eine Verschlüsselung nach dem Stand der Technik“ durch die Angabe „anlassgerecht zu verschlüsseln“ ersetzt.“
    - Stichtag: „…gisterverfahren und Fachverfahren im Sinn des § 11 PStV ist durch eine Verschlüsselung nach dem Stand der Technik und durch die Verwendung von …“ · heute: „…gisterverfahren und Fachverfahren im Sinn des § 11 PStV ist anlassgerecht zu verschlüsseln und durch die Verwendung von …“
  - s02 `recast` in § 4 Abs. 3 Satz 5: „§ 4 Abs. 3 Satz 5 wird wie folgt gefasst: „⁵Eine elektronische Übermittlung der Stichproben ist in geeigneter Weise zu verschlüsseln.““
    - Stichtag: „…nische Übermittlung der Stichproben ist durch eine Verschlüsselung nach dem Stand der Technik abzusichern.“ · heute: „…nische Übermittlung der Stichproben ist in geeigneter Weise zu verschlüsseln.“
- Beginn der Stichtagsfassung: 2015-08-01 – Vorangehende Änderung § 2 Abs. 11 des Gesetzes vom 17. Juli 2015 (GVBl. S. 243): „Dieses Gesetz tritt am 1. August 2015 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2015-243/, SHA-256 96c85bec79320864…

### BayZGAusland

- Änderung GVBl. 2024 S. 247 (https://www.verkuendung-bayern.de/gvbl/2024-247/, SHA-256 `b571c757ebcbca30…`), verkündet 2024-07-30, in Kraft 2024-08-01 („Dieses Gesetz tritt am 1. August 2024 in Kraft.“)
  - s01 `insert-block` in Art. 4: „Nach Art. 3 wird folgender Art. 4 eingefügt: „Art. 4 Zuständigkeit der Verwaltungsgerichtsbarkeit Abweichend von § 58 Abs. 9a Satz 1 AufenthG ist für Anordnungen nach § 58 Abs. 8 AufenthG die Verwaltungsgerichtsbarkeit zuständig.““
    - Stichtag: „(Glied fehlt)“ · heute: „Art. 4 Zuständigkeit der Verwaltungsgerichtsbarkeit Abweichend von § 58 Abs. 9a Satz 1 AufenthG ist für Anordnungen nach § 58 Abs. 8 AufenthG die Verwaltungsgerichtsbarkeit zuständig.“
  - s02 `relabel` in Art. 4 → Art. 5: „Der bisherige Art. 4 wird Art. 5.“
    - Stichtag: „Art. 4“ · heute: „Art. 5“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 272 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayZLV

- Änderung GVBl. 2025 S. 272 (https://www.verkuendung-bayern.de/gvbl/2025-272/, SHA-256 `615fbb7905556219…`), verkündet 2025-07-30, in Kraft 2025-08-01 („Diese Verordnung tritt am 1. August 2025 in Kraft.“)
  - a1-s01 `insert-block` in Anlage Nr. 19: „Der Anlage wird folgende Nr. 19 angefügt: „19. Als Zulassung zum Gebrauch in einer schulartunabhängigen Deutschklasse (§ 47 der Bayerischen Schulordnung – BaySchO) gilt die Zulassung eines Lernmittels zum Gebrauch für die Jahrgangsstufen 5 und 6 an Mittelschulen Förderschulen Realschulen Wirtschafts“
    - Stichtag: „(Glied fehlt)“ · heute: „19. Als Zulassung zum Gebrauch in einer schulartunabhängigen Deutschklasse (§ 47 der Bayerischen Schulordnung – BaySchO) gilt die Zulassung eines Lernmittels zum Gebrauch für die Jahrgangsstufen 5 und“
- Änderung GVBl. 2024 S. 281 (https://www.verkuendung-bayern.de/gvbl/2024-281/, SHA-256 `c823a4a8c6458980…`), verkündet 2024-07-30, in Kraft 2024-08-01 („Diese Verordnung tritt am 1. August 2024 in Kraft.“)
  - a2-s01 `replace-final-words` in § 3 Abs. 1 Nr. 4: „In Nr. 4 wird das Wort „und“ am Ende durch ein Komma ersetzt.“
    - Stichtag: „im Fach Religionslehre von der betreffenden Religionsgemeinscha…“ · heute: „im Fach Religionslehre von der betreffenden Religionsgemeins…“
  - a2-s02 `replace-final-punctuation` in § 3 Abs. 1 Nr. 5: „In Nr. 5 wird der Punkt am Ende durch das Wort „und“ ersetzt.“
    - Stichtag: „…ine für den Unterricht nicht erforderliche Werbung enthalten.“ · heute: „…ine für den Unterricht nicht erforderliche Werbung enthalten und“
  - a2-s03 `insert-block` in § 3 Abs. 1 Nr. 6: „Folgende Nr. 6 wird angefügt: „6. keine mehrgeschlechtlichen Schreibweisen durch Wortbinnenzeichen wie Genderstern, Doppelpunkt, Gender-Gap oder Mediopunkt enthalten.““
    - Stichtag: „(Glied fehlt)“ · heute: „6. keine mehrgeschlechtlichen Schreibweisen durch Wortbinnenzeichen wie Genderstern, Doppelpunkt, Gender-Gap oder Mediopunkt enthalten.“
  - a2-s04 `insert-words` in § 4 Abs. 2 Satz 1: „In § 4 Abs. 2 Satz 1 werden nach dem Wort „schriftlich“ die Wörter „oder in Textform“ eingefügt.“
    - Stichtag: „¹Der Antrag ist schriftlich zu stellen. ²Er muss das zuzulassende Lernmittel bezeichnen…“ · heute: „¹Der Antrag ist schriftlich oder in Textform zu stellen. ²Er muss das zuzulassende Lernmittel bezeichnen…“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 214 der Verordnung vom 26. März 2019 (GVBl. S. 98, 599): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayZuVSchfw

- Änderung GVBl. 2025 S. 149 (https://www.verkuendung-bayern.de/gvbl/2025-149/, SHA-256 `9e6fb6bf79425b81…`), verkündet 2025-05-30, in Kraft 2025-06-01 („Diese Verordnung tritt am 1. Juni 2025 in Kraft.“)
  - s01 `replace-words` in § 1 Abs. 2: „In § 1 Abs. 2 wird die Angabe „§§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 2 Halbsatz 1 und Abs. 3 sowie § 12 Abs. 1 und 2 SchfHwG“ durch die Angabe „§§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 1, Abs. 2 Halbsatz 1 und Abs. 3, § 11b Abs. 1 bis 3 sowie § 12 Abs. 1 und 2 SchfHwG“ ersetzt.“
    - Stichtag: „Zuständige Behörden gemäß den §§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 2 Halbsatz …“ · heute: „Zuständige Behörden gemäß den §§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 1, Abs. 2 Halbsatz 1 und Abs. 3, § 11b …“
- Beginn der Stichtagsfassung: 2018-11-01 – Vorangehende Änderung vom 2. Oktober 2018 (GVBl. S. 786): „Diese Verordnung tritt am 1. November 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-786/, SHA-256 35b659daf2cfcb9a…

### BayZustVAM

- Änderung GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
  - s01 `replace-words` in § 7 Satz 1 Satzteil vor Nr. 1: „In § 7 Satz 1 Satzteil vor Nr. 1 werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
    - Stichtag: „…taatsministeriums oder des Staatsministeriums für Gesundheit und Pflege im Sinn des Art. 18 Abs. 5 BayDG werden ausgeübt…“ · heute: „…taatsministeriums oder des Staatsministeriums für Gesundheit, Pflege und Prävention im Sinn des Art. 18 Abs. 5 BayDG werden ausgeübt…“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 79 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayZustVBM

- Änderung GVBl. 2024 S. 485 (https://www.verkuendung-bayern.de/gvbl/2024-485/, SHA-256 `655fd9d64a353c87…`), verkündet 2024-10-15, in Kraft 2024-11-01 („Diese Verordnung tritt am 1. November 2024 in Kraft.“)
  - s01 `recast` in § 7 (ganzes Glied aus der Stammverkündung): „Der Überschrift werden die Wörter „und Zuschläge zur Gewinnung von IT-Fachkräften“ angefügt. \| Dem Wortlaut wird folgender Abs. 1 vorangestellt: „(1) ¹Die Entscheidung über die Gewährung von IT-Fachkräftegewinnungszuschlägen gemäß Art. 60a BayBesG wird den Leitungen der in § 1 genannten Behörden fü“
    - Stichtag: „§ 7 Leistungsbezüge ¹Die Befugnis zur Entscheidung über die …“ · heute: „§ 7 Leistungsbezüge und Zuschläge zur Gewinnung von IT-Fachkräften (1) ¹Die Entscheidung über die Gewährung von IT-Fachkräftegewinnungszuschlägen gemäß Art. 60a BayBesG wird den Leitungen der in § 1 genannten Behörden für die bei ihnen beschäftigten Beamten und Beamtinnen übertragen. ²Bei abgeordneten Beamten und Beamtinnen entscheidet die Beschäftigungsdienststelle. (2) ¹Die Befugnis zur Entschei……“
- Beginn der Stichtagsfassung: 2021-01-01 – Vorangehende Änderung § 1 der Verordnung vom 30. November 2020 (GVBl. S. 705): „Diese Verordnung tritt am 1. Januar 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-705/, SHA-256 e7bf06a27b0a1bec…

### BayZweckVermG

- Änderung GVBl. 2024 S. 585 (https://www.verkuendung-bayern.de/gvbl/2024-585/, SHA-256 `a639b5ad5f272ba1…`), verkündet 2024-12-16, in Kraft 2024-12-17 („Dieses Gesetz tritt am 17. Dezember 2024 in Kraft.“)
  - s01 `insert-title` in Art. 1: „Folgende Überschrift wird eingefügt: „Bildung und Verwaltung von Zweckvermögen“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Bildung und Verwaltung von Zweckvermögen“
  - s02 `insert-sentence` in Art. 1 Abs. 1: „Dem Abs. 1 wird folgender Satz 3 angefügt: „³Das Staatsministerium wird zudem ermächtigt, durch Vertrag den durch Änderung und Neufassung der Einbringungsverträge geschaffenen Beteiligungsvertrag zu beenden und das Zweckvermögen gegen eine angemessene Erhöhung der mittelbaren Beteiligung des Freista“
    - Stichtag: „(Satz fehlt)“ · heute: „³Das Staatsministerium wird zudem ermächtigt, durch Vertrag den durch Änderung und Neufassung der Einbringungsverträge geschaffenen Beteiligungsvertrag zu beenden und das Zweckvermögen gegen eine ange“
  - s03 `insert-title` in Art. 2: „In Art. 2 wird folgende Überschrift eingefügt: „Wettbewerbsneutralität“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Wettbewerbsneutralität“
  - s04 `insert-title` in Art. 3: „In Art. 3 wird folgende Überschrift eingefügt: „Ausfallbürgschaft“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Ausfallbürgschaft“
  - s05 `insert-title` in Art. 4: „In Art. 4 wird folgende Überschrift eingefügt: „Inkrafttreten“.“
    - Stichtag: „(ohne Überschrift)“ · heute: „Inkrafttreten“
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung § 1 Abs. 329 der Verordnung vom 26. März 2019 (GVBl. S. 98): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…

### BayeAktVArbSozG

- Änderung GVBl. 2026 S. 75 (https://www.verkuendung-bayern.de/gvbl/2026-75/, SHA-256 `97a4022d212061fa…`), verkündet 2026-03-31, in Kraft 2026-04-01 („Dieses Gesetz tritt am 1. April 2026 in Kraft.“)
  - a1-s01 `recast` in § 4 Abs. 2: „§ 4 Abs. 2 wird wie folgt gefasst: „(2) Die elektronische Akte ist mit einem Datenverarbeitungssystem zu führen und aufzubewahren, das die Akte benutzbar, lesbar und auffindbar hält und den in § 64 Abs. 2 Satz 1 der Grundbuchverfügung (GBV) genannten Anforderungen entspricht.““
    - Stichtag: „(2) ¹Die elektronische Akte ist mit einem elektronischen Datenverarbeitungssystem nach dem Stand der Technik zu führen und aufzubewahren. ²Das elektronische Datenverarbeitungssystem muss gewährleisten, dass die elektronische Akte benutzbar, lesbar, übertragbar und auffindbar ist und dass die in § 64“ · heute: „(2) Die elektronische Akte ist mit einem Datenverarbeitungssystem zu führen und aufzubewahren, das die Akte benutzbar, lesbar und auffindbar hält und den in § 64 Abs. 2 Satz 1 der Grundbuchverfügung (GBV) genannten Anforderungen entspricht.“
- Änderung GVBl. 2025 S. 461 (https://www.verkuendung-bayern.de/gvbl/2025-461/, SHA-256 `ec8ae56a3299cbd7…`), verkündet 2025-08-29, in Kraft 2026-01-01 („Diese Verordnung tritt am 1. Januar 2026 in Kraft.“)
  - a2-s01 `recast` in § 2: „§ 2 wird wie folgt gefasst: „§ 2 In Papierform angelegte Akten ¹Bei den Sozialgerichten des Freistaates Bayern werden Akten, die vor dem 1. Januar 2026 in Papierform angelegt wurden, in Papierform weitergeführt. ²Bei den Arbeitsgerichten des Freistaates Bayern werden Akten, die vor dem 1. Januar 202“
    - Stichtag: „§ 2 Einführung der elektronischen Akte (1) ¹Bei den Arbeits- und Sozialgerichten des Freistaates Bayern werden die Akten ab dem 1. Juni 2023 für einzelne Verfahren elektronisch geführt. ²Das Staatsministerium für Familie, Arbeit und Soziales bestimmt durch Verwaltungsvorschrift, die im Bayerischen M“ · heute: „§ 2 In Papierform angelegte Akten ¹Bei den Sozialgerichten des Freistaates Bayern werden Akten, die vor dem 1. Januar 2026 in Papierform angelegt wurden, in Papierform weitergeführt. ²Bei den Arbeitsgerichten des Freistaates Bayern werden Akten, die vor dem 1. Januar 2026 in Papierform angelegt wurd“
  - a2-s02 `delete-words` in § 6 Überschrift: „In der Überschrift wird die Angabe „ , Außerkrafttreten“ gestrichen.“
    - Stichtag: „Inkrafttreten, Außerkrafttreten“ · heute: „Inkrafttreten“
  - a2-s03 `unnumber-paragraph` in § 6 Abs. 1: „In Abs. 1 wird die Angabe „(1)“ gestrichen.“
    - Stichtag: „(1)“ · heute: „(Wortlaut ohne Absatzbezeichnung)“
  - a2-s04 `repeal-unit` in § 6 Abs. 2: „Abs. 2 wird aufgehoben.“
    - Stichtag: „(2) Die E-Rechtsverkehrsverordnung Arbeitsgerichte (ERVV ArbG) vom 13. September 2016 (GVBl. S. 294, BayRS 32-2-A), die durch Verordnung vom 15. September 2017 (GVBl. S. 494) geändert worden ist, tritt mit Ablauf des 16. Mai 2023 außer Kraft.“ · heute: „(aufgehoben)“
- Beginn der Stichtagsfassung: 2023-05-17 – Inkrafttretensvorschrift im Stichtagstext, § 6 Inkrafttreten, Außerkrafttreten: „Diese Verordnung tritt am 17. Mai 2023 in Kraft.“ · Alttext nicht umkehrbarer Befehle aus der Stammverkündung GVBl. 2023 S. 190 (https://www.verkuendung-bayern.de/gvbl/2023-190/, SHA-256 af27c285b681df37…); Wortlaut gleich (3353 Zeichen, typografisch vereinheitlicht)

## Befehle und Rundlauf bestanden, Beginn der Stichtagsfassung nicht belegt

| Norm | Kette | vorangehende Änderung laut Befehl | Grund |
| --- | --- | --- | --- |
| `BayHG2021` | GVBl. 2024 S. 114 (Art. 13) | – (Stammfassung) | Beginn der Stichtagsfassung (Stammfassung) nicht belegt: Die Norm begrenzt ihre eigene Geltung („gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres weiter“); ob sie am Stichtag galt |

## Unbestimmte Geltungsfälle, neu geprüft

Geprüft mit dem Ereignisregister und allen Detailseiten nach dem Stichtag: gesucht war eine Verkündung, die die Norm **stark** zitiert (zwei unabhängige Merkmale, eines davon Ausfertigungsdatum oder BayRS-Nummer) und einen Änderungs- oder Aufhebungsbefehl an sie richtet. Eine solche Verkündung setzt die Geltung der Norm an ihrem Tag voraus; gilt der heutige Text laut Paket seit einem Tag vor dem Stichtag und nennt die Verkündung keine Änderung dazwischen, galt die Norm am Stichtag. Nur die Geltung wird so entschieden; hat die Verkündung den Text geändert, bleibt die Methode unbestimmt.

Ergebnis: **16** Fälle geprüft, **1** neu entschieden, 15 bleiben unbestimmt.

| Norm | vorher | nachher | Befund |
| --- | --- | --- | --- |
| `BayVV_1102_S_14148` | undetermined / undetermined (published-after-baseline-validity-open) | undetermined / undetermined (published-after-baseline-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2038_3_13_B_10514` | undetermined / undetermined (register-absent-validity-open) | undetermined / undetermined (register-absent-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2134_I_128` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2210_2_1_6_5_1_K_721` | undetermined / undetermined (register-absent-validity-open) | undetermined / undetermined (register-absent-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2213_1_K_732` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2230_1_1_0_UK_043` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2230_1_1_1_1_3_UK_203` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2230_1_1_1_K_941` | undetermined / undetermined (register-absent-validity-open) | undetermined / undetermined (register-absent-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2230_7_1_K_10450` | undetermined / undetermined (register-absent-validity-open) | active-at-baseline / undetermined (validity-proven-by-post-baseline-publication) | Geltung am Stichtag belegt: BayMBl. 2025 Nr. 194 vom 2025-05-07 ändert die Norm (starkes Zitat: date+reference+title), ohne eine Änderung dazwischen zu nennen; der Text gilt laut Paket seit 2019-01-01. Der Text wurde danach geändert – Methode bleibt unbestimmt |
| `BayVV_2230_7_1_K_10559` | undetermined / undetermined (register-absent-validity-open) | undetermined / undetermined (register-absent-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_2242_K_763` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_282_1_1_1_2_UK_031` | undetermined / undetermined (register-absent-validity-open) | undetermined / undetermined (register-absent-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_3101_J_039` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_3121_0_J_081` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVV_7840_L_14146` | undetermined / undetermined (published-after-baseline-validity-open) | undetermined / undetermined (published-after-baseline-validity-open) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |
| `BayVwV96713` | undetermined / undetermined (no-issue-date) | undetermined / undetermined (no-issue-date) | Keine Verkündung nach dem Stichtag zitiert die Norm stark mit einem Änderungs- oder Aufhebungsbefehl; kein stark zugeordnetes Ereignis – bleibt unbestimmt |

## Offene Fälle je Gruppe

### genau 1 Änderung nach dem Stichtag (13)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayHG2021` | 1 | `partial-chain/baseline-text-in-force-unproven` | Beginn der Stichtagsfassung (Stammfassung) nicht belegt: Die Norm begrenzt ihre eigene Geltung („gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres weiter“); ob  |  |
| `BayVV_2154_I_2270` | 1 | `partial-chain/chain-partially-in-force` | BayMBl. 2026 Nr. 80 (Nr. 1) tritt teils bis, teils erst nach dem Auswertungsstichtag in Kraft (2026-02-28, 2027-01-01); der heutige Text enthält nur einen Teil der Änderung |  |
| `BayEBekMiZi` | 1 | `unsupported-formula/insert-unit` | BayMBl. 2024 Nr. 666 (Nr. 1): 1.2 1.2.1 „Dem Inhaltsverzeichnis zu Nr. XVII. wird folgende Angabe angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung,  |  |
| `BayVV_2025_I_11358` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 318 (Nr. 1): 1.3 1.3.2 „In Fußnote 4 zu § 9 wird das Wort „Zustellung“ durch das Wort „Bekanntgabe“ ersetzt.“: Ortsangabe nicht lesbar: „Fußnote 4 zu § 9“ |  |
| `BayVV_2230_7_UK_459` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 145 (Nr. 1): 1.1 „In der Kopfzeile der Tabelle wird das Wort „Kommunaler“ gestrichen.“: Ortsangabe nicht lesbar: „der Kopfzeile der Tabelle“ |  |
| `BayVV_2232_2_K_11648` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2026 Nr. 271 (Nr. 1): 1.1 „In Anlage 5 wird in der Kopfzeile die Angabe „Jahrgangsstufen 3 und 4“ durch die Angabe „Jahrgangsstufe 3“ ersetzt.“: Klausel nicht erkannt: „wird in der Kopfzeile d | `renumber` |
| `BayNatWaldV` | 1 | `ambiguous-target/reverse-target-ambiguous` | GVBl. 2024 S. 98 (§ 1): § 7 Abs. 1 Satz 2: neuer Wortlaut „, Forsten und Tourismus“ kommt im Bereich 2-mal vor (erwartet: genau einmal) |  |
| `BayVV_301_I_2284` | 1 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2024 Nr. 484 (Nr. 1): 1.4 Anlage 3: Anlage 3 nicht gefunden |  |
| `BayVV_2235_1_1_1_UK_231` | 1 | `round-trip-failed/reverse-target-not-found` | BayMBl. 2024 Nr. 72 (Nr. 1): Nr. 6: neuer Wortlaut „Oberbayern, Schwaben: StD Johann Forster, Max-Planck-Gymnasium München“ kommt im Bereich 0-mal vor (erwartet: genau einmal) |  |
| `BayVwV270888` | 1 | `round-trip-failed/reverse-overlapping-locations` | BayMBl. 2025 Nr. 538 (Nr. 1): 1.1: die Orte von „jeweils“ überschneiden sich |  |
| `BayVV_913_B_11939` | 1 | `effective-date-undetermined/commencement-unreadable` | BayMBl. 2026 Nr. 354: Keine Grundregel zum Inkrafttreten gefunden |  |
| `BayVV_7803_2_L_10836` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 37 (Nr. 1): Ortsangabe „Nr. 3.1 Tabellenspalte 2“ nicht lesbar (1.2) | `insert-unit`, `unrecognized` |
| `BayVV_3122_2_7_J_063` | 0 | `missing-base/no-post-baseline-event` | Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt |  |

### 2 Änderungen (3)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayHG2022` | 2 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2026 S. 567 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht; die Wortlautprobe gegen die Stammverkündung räumt das nicht aus: Stic |  |
| `BayVV_2210_4_WK_14107` | 2 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2024 Nr. 438 (Nr. 1): 1.2 Nr. 1.2: Nr. 1.2 nicht gefunden |  |
| `BayVwV246099` | 2 | `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 467 (Nr. 1): Ortsangabe „Anhang“ nicht lesbar (1.2) |  |

### 3 oder mehr Änderungen (4)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayAAV` | 4 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2023 S. 659 (notice), GVBl. 2024 S. 163 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichungen nicht |  |
| `BayGDVG` | 3 | `unsupported-formula/unrecognized` | GVBl. 2024 S. 630 (§ 1): 1. „Der Erste Teil wird Teil 1.“: Befehlsrest ohne Schlussverb: „der Erste Teil wird Teil 1“ | `renumber` |
| `BayGGebO` | 3 | `unsupported-formula/renumber` | GVBl. 2026 S. 151 (§ 2): 1. a) „Der Wortlaut wird Buchst. a und die Angabe „ ; “ am Ende wird durch die Angabe „ , “ ersetzt.“: Umnummerierung: strukturelle Änderung, von diesem Modell nicht angewandt | `insert-unit` |
| `BayVwV154422` | 3 | `missing-base/prior-source-unavailable` | Verkündung von „vom 19. März 2024 (BayMBl. Nr. 156)“ nicht verfügbar: keine Seite trägt das Ausfertigungsdatum 2024-03-19 (https://www.verkuendung-bayern.de/baymbl/2024-156/) |  |

### vollständige Neufassung (6)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayAVSG` | 5 | `partial-chain/chain-delayed-predecessor` | Der Vorgänger der Stichtagsfassung GVBl. 2023 S. 334 tritt erst am 2024-01-01 in Kraft – nach dem Stichtag; die Stichtagsfassung enthielte eine Änderung, die am Stichtag nicht galt | `full-recast`, `missing-predecessor-text` |
| `BayVV_360_J_14074` | 2 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2025 Nr. 491 (Nr. 1): 1.2 Teil 1 Nr. 20.1.2: Teil 1 nicht gefunden | `full-recast`, `missing-predecessor-text` |
| `BayVV_7071_W_202` | 4 | `command-unreadable/chain-block-not-found` | BayMBl. 2023 Nr. 652: kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in K | `full-recast`, `missing-predecessor-text` |
| `ARDStV` | 1 | `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Staatsvertrag zur Modernisierung der Medienordnung in Deutschland vom 14. bis 28. April 2020“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht b | `full-recast`, `missing-predecessor-text` |
| `BayVV_108268` | 1 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 270 (Nr. 1): „wird das Verzeichnis extremistischer oder extremistisch beeinflusster Organisationen wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `full-recast`, `missing-predecessor-text` |
| `BayVV_913_B_13942` | 1 | `non-invertible-amendment/recast` | BayMBl. 2024 Nr. 136 (Nr. 1): „wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Neufassung ohne lesbares Zitat | `full-recast`, `missing-predecessor-text` |

### Anlagenersetzung (81)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayVV_2030_13_U_13852` | 1 | `partial-chain/chain-partially-in-force` | BayMBl. 2026 Nr. 234 (Nr. 1) tritt teils bis, teils erst nach dem Auswertungsstichtag in Kraft (2026-07-01, 2027-01-01); der heutige Text enthält nur einen Teil der Änderung | `annex-replacement`, `missing-predecessor-text` |
| `BayVwV312180` | 2 | `partial-chain/chain-ledger-unexplained` | Das Register führt BayMBl. 2023 Nr. 584 (amend) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayGaV` | 3 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 605 (§ 11) tritt am 2025-10-01 in Kraft, die jüngere GVBl. 2024 S. 619 (§ 5) schon am 2025-01-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2034_1_1_F_340` | 3 | `partial-chain/chain-partially-in-force` | BayMBl. 2026 Nr. 137 (§ 2) tritt teils bis, teils erst nach dem Auswertungsstichtag in Kraft (2026-04-01, 2027-03-01, 2027-09-01); der heutige Text enthält nur einen Teil der Änderung | `annex-replacement` |
| `BayERVV` | 4 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2024 S. 5 (amend) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `annex-replacement`, `missing-predecessor-text` |
| `BayHeilBZustV` | 4 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2025 S. 240 (correction) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `annex-replacement`, `missing-predecessor-text` |
| `BayLlbG` | 4 | `partial-chain/chain-other-publication` | Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: https://www.verkuendung-bayern.de/baymbl/2024-154/, https://www.verkuendung-bayern.de/baymbl/2025-111/, https://ww | `annex-replacement`, `missing-predecessor-text` |
| `BaySchErrichtV` | 4 | `partial-chain/chain-commencement-order` | Die vorangehende Änderung GVBl. 2024 S. 305 (§ 1) tritt erst am 2024-08-01 in Kraft – nach dem Stichtag, aber vor einer jüngeren Änderung, die schon vorher galt | `annex-replacement`, `missing-predecessor-text` |
| `VVBayHO` | 4 | `partial-chain/chain-split-commencement` | BayMBl. 2022 Nr. 766 (§ 1) tritt teils vor, teils nach dem Stichtag in Kraft (2023-01-01, 2024-01-01); die Stichtagsfassung enthält nur einen Teil der Änderung | `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayBeamtVG` | 8 | `partial-chain/chain-commencement-order` | Die vorangehende Änderung GVBl. 2024 S. 151 (§ 2) tritt erst am 2024-07-01 in Kraft – nach dem Stichtag, aber vor einer jüngeren Änderung, die schon vorher galt | `annex-replacement`, `missing-predecessor-text` |
| `BayBhV` | 8 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2025 S. 344 (correction) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayVV_2230_1_3_UK_494` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2024 Nr. 367 (Nr. 1): 1.2 „Die Anlagen 1 und 2 werden durch folgende Anlagen ersetzt:“: Befehl mit eigener Änderung und Untergliederung | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2230_7_K_13917` | 2 | `unsupported-formula/unrecognized` | BayMBl. 2026 Nr. 381 (Nr. 1): 1.12 1.12.3 „Im Abschnitt „Zuwendungsvoraussetzungen“ wird in Nr. 1 Satz 2 die Angabe „10. Februar 2020, BayMBl. Nr. 86“ durch die Angabe „23. Januar 202“: Klausel nicht  | `annex-replacement`, `missing-predecessor-text` |
| `BayDONot` | 3 | `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 454 (Nr. 1): 1.1 „Anlage 7 (Dienstordnung für Notarinnen und Notare (DoNot)) wird wie folgt geändert:“: Befehl mit eigener Änderung und Untergliederung | `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayBFSOGesundheit` | 6 | `unsupported-formula/insert-unit` | GVBl. 2025 S. 298 (§ 6): 3. „Dem § 17 Abs. 6 und 7 wird jeweils folgender Satz 3 angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2030_13_I_2296` | 1 | `effective-date-undetermined/commencement-unreadable` | BayMBl. 2025 Nr. 211 (Nr. 1): Inkrafttretensvorschrift nicht lesbar: „Abweichend davon sind die neu gefassten Anlagen 1 und 2 für die Beurteilungen der Beamten und Beamtinnen der ersten und zweiten Qu | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2173_A_13729` | 1 | `effective-date-undetermined/commencement-unreadable` | BayMBl. 2023 Nr. 645: Keine Grundregel zum Inkrafttreten gefunden | `annex-replacement` |
| `BayGLKrWO` | 2 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2019 S. 695: Textlayer nicht verwertbar: Schrift – auf Seite 1 ohne sicher dekodierbare Kodierung | `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayGebOVerm` | 1 | `command-unreadable/location-unreadable` | GVBl. 2026 S. 311 (§ 1): Ortsangabe „Satz 1 Satzteil vor der Tabelle“ nicht lesbar (5. a) aa)) | `annex-recast`, `recast`, `delete-words`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2231_A_13999` | 2 | `command-unreadable/chain-block-not-found` | BayMBl. 2024 Nr. 656: kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag in K | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_630_F_981` | 2 | `command-unreadable/location-unreadable` | BayMBl. 2026 Nr. 215 (§ 3): Ortsangabe „Anlage 2 [Gruppierungsplan (GPl) mit Zuordnungshinweisen]“ nicht lesbar (1.) | `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_7912_4_U_11130` | 2 | `command-unreadable/location-unreadable` | BayMBl. 2024 Nr. 593 (Nr. 1): Ortsangabe „Einführung“ nicht lesbar (1.1) | `annex-recast`, `delete-words`, `recast`, `repeal-unit`, `insert-unit`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayKWaldV` | 3 | `command-unreadable/location-unreadable` | GVBl. 2026 S. 308 (§ 1): Ortsangabe „Tabelle“ nicht lesbar (5. b)) | `recast`, `unrecognized`, `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayMSO` | 3 | `command-unreadable/location-unreadable` | GVBl. 2026 S. 425 (§ 6): Ortsangabe „Nr. I.“ nicht lesbar (15. c)) | `recast`, `delete-words`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_61_02_03_01_F_12848` | 3 | `command-unreadable/chain-block-not-found` | BayMBl. 2024 Nr. 178: kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Der Einleitungssatz kündigt Befehle an, es folgen aber keine); die Änderung tritt nach dem Stichtag in | `annex-replacement` |
| `BayFOBOSO` | 5 | `command-unreadable/location-unreadable` | GVBl. 2026 S. 335 (§ 7): Ortsangabe „Tabelle der Anlage 3“ nicht lesbar (13.) | `repeal-unit`, `delete-words`, `recast`, `unrecognized`, `insert-unit`, `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BaySchO2016` | 5 | `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 272 (§ 1): kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Ein Zitat wird bis zum Ende der Seite nicht geschlossen); die Änderung tritt nach dem Stichtag in K | `annex-replacement`, `missing-predecessor-text` |
| `BayBesG` | 7 | `command-unreadable/chain-block-not-found` | GVBl. 2026 S. 208 (Art. 10, Art. 11, Art. 12, Art. 13, Art. 14): kein eindeutig lesbarer Änderungsbefehl für die Norm; die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen werden | `annex-replacement`, `missing-predecessor-text` |
| `BayFSO` | 8 | `command-unreadable/location-unreadable` | GVBl. 2026 S. 335 (§ 6): Ortsangabe „Tabelle der Nr. 3.1“ nicht lesbar (6. a)) | `annex-recast`, `delete-words`, `insert-unit`, `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayVwV230264` | 1 | `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 17. September 2021 (BayMBl. Nrn. 718, 728)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2230_1_3_K_13922` | 3 | `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 6. Mai 2024 (BayMBI. Nr. 244)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar | `annex-replacement`, `missing-predecessor-text` |
| `BayBeschGebV` | 1 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2024 S. 420 (§ 1): Rückfall Anlage: die Anlage steht in der Verkündung (GVBl. 2012 S. 669) nur als PDF-Anhang („Anlage zu 2013-2-10-W“) – kein Text der Seite | `annex-replacement`, `missing-predecessor-text` |
| `BayKurtaxV` | 1 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2024 S. 391 (§ 1): Rückfall Anlage 2: die Anlage steht in der Verkündung (GVBl. 2013 S. 582) nur als PDF-Anhang („Anlage 2 zu 2013-4-1-F“) – kein Text der Seite | `annex-replacement` |
| `BayVPSW` | 1 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2025 S. 166 (§ 1): 8. Anlage: die Anlage steht in der Verkündung (GVBl. 2010 S. 772) nur als PDF-Anhang („753-1-14-UG Anlage Entsprechungstabelle“) – kein Text der Seite | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2232_3_K_11645` | 1 | `non-invertible-amendment/restore-annex-attachment` | BayMBl. 2026 Nr. 24 (Nr. 1): 1.3 Anlage 15: die Anlage steht in der Verkündung (BayMBl. 2020 Nr. 747) nur als PDF-Anhang („Anlage 1: Zwischenzeugnis für die Jahrgangsstufen 5 und 6“, „Anlage 2: Jahres | `annex-replacement`, `missing-predecessor-text` |
| `BayVwV288385` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2025 Nr. 347 (Nr. 1): Rückfall Nr. III: in der Verkündung (KWMBl. 2014 S. 109) nicht eindeutig gefunden | `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayVwV96486` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 587 (Nr. 2): 2.1 2.1.1 „Spiegelstrich 1 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `renumber`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayWeinRAV` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2023 S. 629 (§ 1): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Inhaltsübersi | `renumber`, `annex-replacement`, `missing-predecessor-text` |
| `BayAVOGFRG` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 78 (§ 1): 2. a) aa) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `annex-replacement`, `missing-predecessor-text` |
| `BayHZV` | 2 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2026 S. 175 (§ 1): Rückfall Anlage 5: die Anlage steht in der Verkündung (GVBl. 2020 S. 87) nur als PDF-Anhang („Anlage 3, 4 und 5 zu 2010-8-2-1-1-WK“) – kein Text der Seite | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2012_4_5_I_10532` | 2 | `non-invertible-amendment/restore-annex-attachment` | BayMBl. 2025 Nr. 300 (Nr. 1): 1.3 Anlage: die Anlage steht in der Verkündung (BayMBl. 2019 Nr. 302) nur als PDF-Anhang („Anlage: Vertrag (Muster)“) – kein Text der Seite | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2230_7_K_11816` | 2 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 288 (Nr. 1): 1.2 „Die Anlage 3 wird durch folgende Anlage ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext – aus der Verkündung nicht wiederherstellbar: Neufassung ohne lesbares | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2235_1_1_2_K_1005` | 2 | `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 523 (Nr. 1): 1.2 „Nr. 3 Satz 3 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `delete-words`, `unrecognized`, `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayVV_2236_9_1_K_10781` | 2 | `non-invertible-amendment/restore-annex-attachment` | BayMBl. 2026 Nr. 145 (Nr. 1): Anlage 2: die Anlage steht in der Verkündung (BayMBl. 2019 Nr. 496) nur als PDF-Anhang („Anlage 2: Stundentafel“) – kein Text der Seite | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2239_K_12604` | 2 | `non-invertible-amendment/recast` | BayMBl. 2024 Nr. 9 (Nr. 1): 1.6 „Die Anlagen 6, 8 und 14 werden durch folgende Anlagen ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext – aus der Verkündung nicht wiederherstellbar: Neufassung o | `insert-unit`, `unrecognized`, `renumber`, `annex-replacement`, `missing-predecessor-text` |
| `BayVwV233866` | 2 | `non-invertible-amendment/restore-annex-attachment` | BayMBl. 2025 Nr. 529 (Nr. 1): 1.4 Anlage 3, Anlage 4, Anlage 5: die Anlage steht in der Verkündung (KWMBl. 2009 S. 400) nur als PDF-Anhang („Anlage 3: Zeugnis über den Ausbildungsabschnitt II/1“) – ke | `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayVwV235144` | 2 | `non-invertible-amendment/restore-annex-attachment` | BayMBl. 2025 Nr. 526 (Nr. 1): 1.4 Anlage 3, Anlage 4, Anlage 5: die Anlage steht in der Verkündung (KWMBl. 2010 S. 25) nur als PDF-Anhang („Anlage 3: Zeugnis über den Ausbildungsabschnitt“) – kein Tex | `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayAVFiG` | 4 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 126 (§ 1): 2. „In § 3 Satz 1 Nr. 4 Buchst. a Doppelbuchst. aa und bb wird jeweils die Angabe „v. H.“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `annex-replacement`, `missing-predecessor-text` |
| `BayAgrSchO` | 4 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2026 S. 487 (§ 1): Rückfall Anlage 9: die Anlage steht in der Verkündung (GVBl. 2019 S. 564) nur als PDF-Anhang („Anlage 1 (zu § 21 Abs. 2 Satz 3)“, „Anlage 2 (zu § 21 Abs. 2 Satz 3)“, „Anlage 3 | `annex-replacement`, `missing-predecessor-text` |
| `BayVSO` | 5 | `non-invertible-amendment/recast` | GVBl. 2025 S. 272 (§ 3): 1. „§ 10 Abs. 4 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `annex-replacement`, `missing-predecessor-text` |
| `BayWSO` | 5 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 425 (§ 14): 2. b) „Abs. 9 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayBFSO2023` | 7 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2026 S. 335 (§ 4): Rückfall Anlage 6: die Anlage steht in der Verkündung (GVBl. 2023 S. 257) nur als PDF-Anhang („Anlage 6 (zu § 9 Abs. 1 Satz 1): Stundentafel für die Berufsfachschulen für Fr | `annex-replacement`, `missing-predecessor-text` |
| `BayDiV` | 7 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 199 (§ 1): „In Nr. 1.1.2, Spalte 3 der Anlage wird die Angabe „ , Bezirke“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `annex-replacement`, `table-replacement`, `missing-predecessor-text` |
| `BayFakO` | 8 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 335 (§ 8): 9. b) „Fußnote 1 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Fußnote 1“ nicht lesbar | `insert-unit`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayFachVVI` | 1 | `asset-missing/annex-recast` | GVBl. 2024 S. 537 (§ 1): 45. „Die Anlage aus dem Anhang zu dieser Verordnung wird angefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl | `insert-unit`, `unrecognized`, `replace-words`, `relabel`, `annex-replacement`, `missing-predecessor-text` |
| `BayGesVSV` | 1 | `asset-missing/annex-recast` | GVBl. 2025 S. 17 (§ 1): 7. „Die aus dem Anhang zu dieser Verordnung ersichtliche Anlage 2 wird angefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im B | `renumber`, `annex-replacement` |
| `BayPKHGDB` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 349 (Nr. 1): „Die Anlagen 1 und 2 erhalten die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alt | `annex-replacement` |
| `BayVV_2179_A_11861` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 577 (Nr. 1): 1.13 „Die Anlage 1 wird durch die dieser Bekanntmachung beigefügte Anlage ersetzt. Die Anlage 2 wird aufgehoben.“: Anlage oder Anhang in neuer Fassung aus einer beigefügt | `insert-unit`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2230_1_1_1_1_3_UK_205` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 260 (Nr. 1): 1.18 „Die Anlagen 1 bis 5 erhalten die aus dem Anhang dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der A | `recast`, `repeal-unit`, `insert-unit`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2244_F_12366` | 1 | `asset-missing/annex-recast` | BayMBl. 2023 Nr. 632 (§ 1): 15. „Die Muster 1 und 2 zur Richtlinie für die Förderung von Verbänden der Heimat- und Brauchpflege erhalten die aus dem Anhang zu dieser Bekannt“: Anlage oder Anhang in ne | `unrecognized`, `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayVV_2244_F_13364` | 1 | `asset-missing/annex-recast` | BayMBl. 2023 Nr. 647 (§ 1): 18. „Das Muster zur Richtlinie für die Förderung von Aktivitäten im Bayerischen Trachtenverband e. V. erhält die aus dem Anhang zu dieser Bekannt“: Anlage oder Anhang in ne | `unrecognized`, `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayVV_34_I_12346` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 276 (Nr. 1): 1.27 „Die Anlagen 1 bis 5 erhalten die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; de | `unrecognized`, `replace-words`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_7803_2_L_10838` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 43 (Nr. 1): 1.4 „Die bisherige Anlage wird durch die Anlage dieser Bekanntmachung ersetzt.“: Anlage durch eine beigefügte Anlage ersetzt; der Alttext steht nicht im Befehl | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_787_L_13483` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 575 (Nr. 1): 1.13 „Die bisherige Anlage wird durch die Anlage dieser Bekanntmachung ersetzt.“: Anlage durch eine beigefügte Anlage ersetzt; der Alttext steht nicht im Befehl | `insert-unit`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_787_L_13875` | 1 | `asset-missing/annex-recast` | BayMBl. 2024 Nr. 420 (Nr. 1): „Anlage 1 „Bauliche Anforderungen an eine besonders tiergerechte Haltung (btH)-Premiumförderung“ wird durch die dieser Richtlinie beigefügten“: Anlage oder Anhang in neue | `annex-replacement` |
| `BayVV_7910_U_11781` | 1 | `asset-missing/annex-recast` | BayMBl. 2024 Nr. 533 (Nr. 1): 1.18 „Die Anlage wird nach Maßgabe der dieser Bekanntmachung als Bestandteil beigefügten Anlage neu gefasst.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten D | `insert-unit`, `annex-replacement`, `missing-predecessor-text` |
| `BayVwV102363` | 1 | `asset-missing/annex-recast` | BayMBl. 2026 Nr. 162 (Nr. 1): „Die Anlagen 1 bis 3 erhalten die aus den Anlagen 1 bis 3 zu dieser Verwaltungsvorschrift ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügte | `annex-replacement` |
| `BayVwV260147` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 136 (Nr. 1): „Der Anhang erhält die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht  | `annex-replacement` |
| `BayVwV265186` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 210 (Nr. 1): 1.6 „Die Anlage wird durch die dieser Bekanntmachung beigefügten Anlagen 1 und 2 ersetzt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext s | `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayVwV274719` | 1 | `asset-missing/annex-recast` | BayMBl. 2024 Nr. 655 (Nr. 1): 1.5 „Die bisherige Anlage wird durch die folgende Anlage ersetzt.“: Anlage durch eine folgende Anlage ersetzt; der Alttext steht nicht im Befehl | `unrecognized`, `annex-replacement` |
| `BayVwV96569` | 1 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 118 (Nr. 1): 1.13 „Anlage 2 erhält die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext ste | `recast`, `delete-words`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayBergVO` | 2 | `asset-missing/annex-recast` | GVBl. 2026 S. 282 (§ 1): 71. „Nach Anlage 2 werden die aus dem Anhang zu dieser Verordnung ersichtlichen Anlagen 3 bis 5 eingefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; d | `repeal-unit`, `recast`, `insert-unit`, `renumber`, `unrecognized`, `relabel`, `annex-replacement`, `missing-predecessor-text` |
| `BayFachVbtuD` | 2 | `asset-missing/annex-recast` | GVBl. 2025 S. 493 (§ 1): 18. „Die Anlagen 1 bis 3 erhalten jeweils die aus dem Anhang zu dieser Verordnung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der  | `delete-words`, `recast`, `repeal-unit`, `renumber`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayVV_2034_3_1_F_13872` | 2 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 308 (§ 1): „Die Anlagen 1, 5 und 10 erhalten die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der A | `annex-replacement` |
| `BayVV_2154_I_13077` | 2 | `asset-missing/annex-recast` | BayMBl. 2026 Nr. 255 (Nr. 1): 1.22 „Anlage 1 wird durch die aus dem Anhang zu dieser Bekanntmachung ersichtliche Anlage ersetzt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der  | `repeal-unit`, `insert-unit`, `annex-replacement`, `missing-predecessor-text` |
| `BayWG` | 2 | `asset-missing/annex-recast` | GVBl. 2025 S. 667 (§ 1): 37. „Die aus dem Anhang zu diesem Gesetz ersichtliche Anlage 3 wird angefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Bef | `repeal-unit`, `recast`, `delete-words`, `unrecognized`, `annex-replacement`, `missing-predecessor-text` |
| `BayPBefKostenV45a` | 3 | `asset-missing/annex-recast` | GVBl. 2025 S. 234 (§ 1): „Die Anlage erhält die aus dem Anhang zu dieser Verordnung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im  | `annex-replacement`, `missing-predecessor-text` |
| `BayVV_7904_L_11560` | 3 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 497 (Nr. 1): 1.1 „Die bisherige Anlage 1 wird durch die Anlage 1 dieser Bekanntmachung ersetzt.“: Anlage durch eine beigefügte Anlage ersetzt; der Alttext steht nicht im Befehl | `annex-replacement` |
| `BayVwV159238` | 3 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 584 (§ 1): „Die Anlagen 1 (Auslandstage- und Auslandsübernachtungsgelder) und 2 (Pauschbeträge für Verpflegungsmehraufwendungen und Übernachtungskosten)“: Anlage oder Anhang in neuer  | `annex-replacement` |
| `BayVV_6322_F_998` | 4 | `asset-missing/annex-recast` | BayMBl. 2026 Nr. 215 (§ 4): 15. „Die Anlagen M 30, M 32, M 33, M 35, M 40, M 42, M 50 und M 70 erhalten die aus dem Anhang 2 zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neue | `delete-words`, `repeal-unit`, `recast`, `unrecognized`, `annex-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayVV_7912_4_U_11677` | 8 | `asset-missing/annex-recast` | BayMBl. 2025 Nr. 568 (Nr. 1): „Die Anlage „Wolfsgebiete im Sinne des Schadensausgleichs“ wird nach Maßgabe der dieser Bekanntmachung als Bestandteil beigefügten Anlage neu“: Anlage oder Anhang in neue | `annex-replacement` |

### Tabellenersetzung (14)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayAVRDG` | 3 | `partial-chain/chain-commencement-order` | GVBl. 2026 S. 159 (§ 23) tritt am 2026-04-15 in Kraft, die jüngere GVBl. 2026 S. 75 (§ 54) schon am 2026-04-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `table-replacement`, `missing-predecessor-text` |
| `BayZustVGA` | 7 | `partial-chain/chain-commencement-order` | GVBl. 2025 S. 580 (§ 4) tritt am 2026-09-01 in Kraft, die jüngere GVBl. 2026 S. 282 (§ 2) schon am 2026-06-16; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `table-replacement`, `missing-predecessor-text` |
| `BayZustVSt` | 10 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2025 S. 731 (correction) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `table-replacement`, `missing-predecessor-text` |
| `BayVwV251225` | 2 | `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 60 (Nr. 1): 2. „Die Anlage „Zuordnung von im Geschäftsbereich des Bayerischen Staatsministeriums für Unterricht und Kultus ausgeübten Funktionen zu Ämtern d“: Befehl mit eigener Änder | `table-replacement`, `missing-predecessor-text` |
| `BayVV_7846_L_13701` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 481 (Nr. 1): Ortsangabe „Fußnote Nr. 3“ nicht lesbar (1.5 1.5.3) | `insert-unit`, `unrecognized`, `table-replacement`, `missing-predecessor-text` |
| `BaySchFG` | 13 | `command-unreadable/chain-block-not-found` | GVBl. 2023 S. 495 (§ 5): kein eindeutig lesbarer Änderungsbefehl für die Norm; die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen werden | `table-replacement`, `missing-predecessor-text` |
| `BayVwV151525` | 1 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 72 (§ 1): 1. „Die Einleitung wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `renumber`, `unrecognized`, `insert-unit`, `table-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayVwV96617` | 1 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 318 (Nr. 1): 1.2 „In der Anlage wird in Abschnitt I Nr. 1 Buchst. a die Überschrift der Spalte 4 wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `unrecognized`, `table-replacement`, `missing-predecessor-text` |
| `BayFakaLwV` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 418 (§ 2): 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `insert-unit`, `table-replacement`, `missing-predecessor-text` |
| `BayVV_2273_I_13469` | 2 | `non-invertible-amendment/restore-shape` | BayMBl. 2025 Nr. 565 (Nr. 1): Rückfall Nr. 5.3.5.2.4: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; tableRow>tableCell\|t | `table-replacement`, `missing-predecessor-text` |
| `BayVV_2330_B_13734` | 2 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 86 (Nr. 1): 1.5 1.5.1 Nr. 48 Nr. 48.1: in der Verkündung (BayMBl. 2023 Nr. 206) nicht eindeutig gefunden | `table-replacement`, `image-replacement`, `missing-predecessor-text` |
| `BayVV_7071_W_10501` | 2 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 543 (Nr. 1): 1.1 „Die Tabelle in Nr. 6.1 erster Spiegelstrich wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Neu | `table-replacement`, `missing-predecessor-text` |
| `BayVV_2235_1_1_1_K_13677` | 3 | `non-invertible-amendment/restore-new-mismatch` | BayMBl. 2026 Nr. 338 (Nr. 1): 1.3 Nr. 2: das neu gefasste Glied im heutigen Text ist nicht wörtlich der zitierte Wortlaut | `table-replacement`, `missing-predecessor-text` |
| `BayVV_7071_W_10425` | 3 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 541 (Nr. 1): 1.1 „Die Tabelle in Nr. 6.1.1 erster Spiegelstrich wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: N | `table-replacement`, `missing-predecessor-text` |

### Bildersetzung (5)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayVV_7801_L_10618` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2026 Nr. 67 (Nr. 1): Ortsangabe „Titel“ nicht lesbar (1.1) | `unrecognized`, `image-replacement`, `missing-predecessor-text` |
| `BayStrWG` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 699 (§ 1): 2. a) „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `unrecognized`, `image-replacement`, `missing-predecessor-text` |
| `BayVV_2010_K_13179` | 2 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (BayMBl. 2022 Nr. 436) weichen ab Zeichen 24159 ab: Portal „…iterführendeInformationenfindensichun | `image-replacement`, `missing-predecessor-text` |
| `BayVV_2253_D_12831` | 2 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 247 (§ 1): 21. c) „Die Sätze 4 und 5 werden die Nr. 5.2.4 Satz 1 und 2 und Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wi | `insert-unit`, `unrecognized`, `relabel`, `image-replacement`, `missing-predecessor-text` |
| `BayVwVfG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 599 (§ 1): 1. a) „Abs. 2 Satz 4 und 5 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `delete-words`, `recast`, `insert-unit`, `image-replacement`, `missing-predecessor-text` |

### fehlender Vorgängertext (287)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayFamGG` | 1 | `partial-chain/chain-other-publication` | Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: https://www.verkuendung-bayern.de/gvbl/2025-107/, https://www.verkuendung-bayern.de/gvbl/2025-650/ | `missing-predecessor-text` |
| `BayKatSchutzG` | 1 | `partial-chain/chain-register-undated` | Fortführungsnachweis mit nicht lesbarer Notiz („1) mehrfach geänd. (§ 1 G v. ; S. 130)“) | `missing-predecessor-text` |
| `BayKlimaG` | 1 | `partial-chain/chain-delayed-predecessor` | Der Vorgänger der Stichtagsfassung GVBl. 2020 S. 598 tritt erst am 2025-01-01 in Kraft – nach dem Stichtag; die Stichtagsfassung enthielte eine Änderung, die am Stichtag nicht galt | `missing-predecessor-text` |
| `BaySozKiPaedG` | 1 | `partial-chain/chain-other-publication` | Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: https://www.verkuendung-bayern.de/gvbl/2024-98/ | `missing-predecessor-text` |
| `BayJFPO` | 2 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2024 S. 415 (amend) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `missing-predecessor-text` |
| `BayLPflGG` | 2 | `partial-chain/chain-other-publication` | Weitere Verkündung(en) nach dem Stichtag zitieren die Norm mit einem Änderungsbefehl: https://www.verkuendung-bayern.de/gvbl/2025-570/ | `missing-predecessor-text` |
| `BayVersRueG` | 2 | `partial-chain/chain-commencement-order` | GVBl. 2026 S. 75 (§ 21) tritt am 2026-04-01 in Kraft, die jüngere GVBl. 2026 S. 208 (Art. 9) schon am 2026-01-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayZustGVerk` | 2 | `partial-chain/chain-register-undated` | Fortführungsnachweis mit nicht lesbarer Notiz („3) Art. 8 neu gefasst (§ 3 G v. ; S. 130)“) | `missing-predecessor-text` |
| `BayFachVFw` | 3 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 12 (§ 2) tritt am 2025-01-01 in Kraft, die jüngere GVBl. 2024 S. 159 (§ 2) schon am 2024-07-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayLStVG` | 3 | `partial-chain/chain-register-undated` | Fortführungsnachweis mit nicht lesbarer Notiz („6) mehrfach geänd. (§ 2 G v. ; S. 130)“) | `missing-predecessor-text` |
| `BayMG` | 3 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 584 (§ 1) tritt am 2024-12-30 in Kraft, die jüngere GVBl. 2024 S. 584 (§ 2) schon am 2024-12-17; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayAVKiBiG` | 4 | `partial-chain/chain-commencement-order` | GVBl. 2025 S. 152 (§ 1) tritt am 2024-12-17 in Kraft, die jüngere GVBl. 2025 S. 152 (§ 2) schon am 2024-12-09; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayBestV` | 4 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 98 (§ 1) tritt am 2024-07-01 in Kraft, die jüngere GVBl. 2024 S. 160 (§ 1) schon am 2024-06-30; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BaySchBerV` | 4 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2024 S. 567 (correction) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht | `missing-predecessor-text` |
| `BayBezO` | 5 | `partial-chain/chain-commencement-order` | GVBl. 2026 S. 374 (§ 5) tritt am 2026-08-01 in Kraft, die jüngere GVBl. 2026 S. 374 (§ 6) schon am 2026-01-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayGO` | 5 | `partial-chain/chain-commencement-order` | Die vorangehende Änderung GVBl. 2023 S. 385 (§ 2) tritt erst am 2024-01-01 in Kraft – nach dem Stichtag, aber vor einer jüngeren Änderung, die schon vorher galt | `missing-predecessor-text` |
| `BayLKrO` | 5 | `partial-chain/chain-commencement-order` | Die vorangehende Änderung GVBl. 2023 S. 385 (§ 4) tritt erst am 2024-01-01 in Kraft – nach dem Stichtag, aber vor einer jüngeren Änderung, die schon vorher galt | `missing-predecessor-text` |
| `BayAVHIG` | 6 | `partial-chain/chain-commencement-order` | GVBl. 2023 S. 644 (§ 2) tritt am 2024-10-01 in Kraft, die jüngere GVBl. 2024 S. 395 (§ 1) schon am 2024-08-15; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayKiBiG` | 6 | `partial-chain/chain-commencement-order` | GVBl. 2026 S. 75 (§ 30) tritt am 2026-04-01 in Kraft, die jüngere GVBl. 2026 S. 139 (§ 4) schon am 2026-01-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayAGSG` | 7 | `partial-chain/chain-commencement-order` | Die vorangehende Änderung GVBl. 2023 S. 334 (§ 1) tritt erst am 2024-01-01 in Kraft – nach dem Stichtag, aber vor einer jüngeren Änderung, die schon vorher galt | `missing-predecessor-text` |
| `BayBSO` | 7 | `partial-chain/chain-commencement-order` | GVBl. 2025 S. 298 (§ 4) tritt am 2025-08-01 in Kraft, die jüngere GVBl. 2025 S. 298 (§ 5) schon am 2025-07-31; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayHIG` | 7 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 605 (§ 14) tritt am 2025-01-01 in Kraft, die jüngere GVBl. 2024 S. 632 (§ 8) schon am 2024-12-31; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayAVJG` | 8 | `partial-chain/chain-ledger-unexplained` | Das Register führt GVBl. 2024 S. 241 (notice), GVBl. 2026 S. 276 (notice) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichungen nicht | `missing-predecessor-text` |
| `BayEUG` | 8 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 263 (§ 1) tritt am 2024-08-01 in Kraft, die jüngere GVBl. 2024 S. 263 (§ 2) schon am 2024-07-31; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayZustVVerk` | 8 | `partial-chain/chain-commencement-order` | GVBl. 2025 S. 523 (§ 1) tritt am 2026-01-01 in Kraft, die jüngere GVBl. 2025 S. 535 (§ 1) schon am 2025-10-16; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayBO` | 12 | `partial-chain/chain-commencement-order` | GVBl. 2024 S. 605 (§ 13) tritt am 2025-10-01 in Kraft, die jüngere GVBl. 2024 S. 619 (§ 4) schon am 2025-01-01; die Reihenfolge der Fassungen ist nicht die der Verkündungen | `missing-predecessor-text` |
| `BayDelV` | 17 | `partial-chain/chain-parallel-order` | Eine parallele Änderung lässt sich nicht eindeutig in die Kette einordnen (Reihenfolge nach Inkrafttreten weicht von der Kette ab) | `missing-predecessor-text` |
| `BayVV_2013_1_F_11403` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2024 Nr. 456 (§ 2): 2. „In der Präambel Satz 1 werden nach dem Wort „die“ die Wörter „dem Freistaat Bayern,“ eingefügt, die Angabe „BayFoG“ durch die Wörter „Bayern“: Klausel nicht erkannt: „, | `missing-predecessor-text` |
| `BayVV_2013_2_F_13526` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2026 Nr. 258 (§ 1): 34. „Die bisherige Nr. 20.2 wird Nr. 21.2 und Satz 1 Buchst. b wird wie folgt gefasst:“: Befehlsrest ohne Schlussverb: „Satz 1 Buchst. b wird wie folgt gefasst:“ | `missing-predecessor-text` |
| `BayVV_2038_3_11_G_13478` | 1 | `unsupported-formula/insert-unit` | BayMBl. 2025 Nr. 391 (Nr. 1): 1.8 „Nach Nr. 14.2 wird folgende Überschrift eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nich | `missing-predecessor-text` |
| `BayVV_2235_1_1_1_K_12238` | 1 | `unsupported-formula/renumber` | BayMBl. 2024 Nr. 327 (Nr. 1): 1.3 „Die bisherigen Nrn. 4 und 5 werden die Nrn. 2.2 und 2.3 und die Wörter „des Ministerialbeauftragten“ werden jeweils durch die Wörter „der bz“: Umnummerierung: strukt | `unrecognized`, `missing-predecessor-text` |
| `BayVV_7815_L_11779` | 1 | `unsupported-formula/insert-unit` | BayMBl. 2026 Nr. 86 (Nr. 1): 1.8 1.8.1 „Es wird folgender neuer Satz 1 eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht an | `renumber`, `unrecognized`, `missing-predecessor-text` |
| `BayVwV294820` | 1 | `unsupported-formula/unrecognized` | BayMBl. 2026 Nr. 92 (§ 1): 5. „Nr. 2.1.6 wird Nr. 2.1.5 und in Satz 1 die Angabe „Nrn. 2.1.4 und 2.1.5 nicht erfüllt sind“ durch die Angabe „Nr. 2.1.4 nicht erfüllt ist“ e“: Klausel nicht erkannt: „In | `missing-predecessor-text` |
| `BayVV_2126_0_G_11745` | 2 | `unsupported-formula/insert-unit` | BayMBl. 2025 Nr. 206 (Nr. 1): 1.3 „Nach der Vorbemerkung wird folgende Überschrift eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Mod | `renumber`, `missing-predecessor-text` |
| `BayVV_2330_I_1190` | 2 | `unsupported-formula/insert-unit` | BayMBl. 2024 Nr. 6 (Nr. 1): 1.1 „Folgende Vorbemerkung wird vorangestellt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt | `unrecognized`, `missing-predecessor-text` |
| `BayKommZG` | 4 | `unsupported-formula/insert-unit` | GVBl. 2026 S. 374 (§ 8): 2. „Nach dem Sechsten Teil wird folgender Siebter Teil eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell | `renumber`, `missing-predecessor-text` |
| `BayVV_7071_W_10524` | 4 | `unsupported-formula/unrecognized` | BayMBl. 2025 Nr. 278 (Nr. 1): 1.1 „In der Überschrift der Bekanntmachung wird die Angabe „4.0“ gestrichen.“: Ortsangabe nicht lesbar: „der Überschrift der Bekanntmachung“ | `insert-unit`, `missing-predecessor-text` |
| `BayDiG` | 5 | `unsupported-formula/insert-unit` | GVBl. 2024 S. 474 (§ 1): 5. „Nach Art. 49 wird folgendes Kapitel 4 eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewa | `missing-predecessor-text` |
| `BayEzG2021` | 1 | `ambiguous-target/reverse-location-unresolved` | GVBl. 2026 S. 306 (§ 1): 5. Art. 7: Art. 7 mehrfach vorhanden | `missing-predecessor-text` |
| `BayVV_2126_0_G_11762` | 1 | `ambiguous-target/reverse-sentence-ambiguous` | BayMBl. 2024 Nr. 512 (Nr. 1): 1.3 1.3.3: Satznummer ³ steht 2-mal im Feld (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVV_2126_0_G_12665` | 1 | `ambiguous-target/reverse-target-ambiguous` | BayMBl. 2025 Nr. 528 (Nr. 1): 1.4 1.4.2 Nr. 7 Satz 4: Anker mit eingefügtem Wortlaut „schriftlich oder elektronisch“ kommt im Bereich 3-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVV_2126_0_G_13305` | 1 | `ambiguous-target/reverse-end-not-determined` | BayMBl. 2025 Nr. 390 (Nr. 1): 1.4 1.4.3 Nr. 2.5.2: genau ein Textfeld verlangt, der Bereich hat 6 | `missing-predecessor-text` |
| `BayVV_2130_0_F_13459` | 1 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2025 Nr. 189 (§ 1): 24. Anlage 2 Nr. 2.5: Anlage 2 nicht gefunden | `missing-predecessor-text` |
| `BayVV_2230_1_1_1_2_4_K_11098` | 1 | `ambiguous-target/reverse-end-not-determined` | BayMBl. 2026 Nr. 356 (Nr. 1): 1.24 1.24.3 Nr. 3.5.4: genau ein Textfeld verlangt, der Bereich hat 5 | `missing-predecessor-text` |
| `BayVV_7011_W_10851` | 1 | `ambiguous-target/reverse-target-ambiguous` | BayMBl. 2025 Nr. 495 (Nr. 1): 1.3 Nr. 4.1 Satz 2: neuer Wortlaut „FEI-Unionsrahmen“ kommt im Bereich 2-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVV_787_L_10691` | 1 | `ambiguous-target/reverse-end-not-determined` | BayMBl. 2025 Nr. 35 (Nr. 1): 1.3 1.3.2 Nr. 6.3.2: genau ein Textfeld verlangt, der Bereich hat 4 | `missing-predecessor-text` |
| `BayVwV229918` | 1 | `ambiguous-target/forward-target-ambiguous` | BayMBl. 2025 Nr. 201 (Nr. 1): s03: zu ersetzender Wortlaut „2009“ kommt im Bereich 2-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVwV263859` | 1 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2024 Nr. 599 (Nr. 1): 1.5 Anlage 1: Anlage 1 nicht gefunden | `missing-predecessor-text` |
| `BaySvVollzG` | 2 | `ambiguous-target/reverse-location-unresolved` | GVBl. 2025 S. 178 (§ 2): 6. b) bb) Art. 70 Teil <unbestimmt>: Teil <unbestimmt> nicht gefunden | `missing-predecessor-text` |
| `BayVV_2230_1_3_K_14015` | 2 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2024 Nr. 392 (Nr. 1): 1.3 Nr. 5 Nr. 5.4: Nr. 5.4 nicht gefunden | `missing-predecessor-text` |
| `BayVV_3122_2_0_J_10825` | 2 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2024 Nr. 573 (Nr. 1): 1.10 Nr. 62 Satz 1: Nr. 62 mehrfach vorhanden | `missing-predecessor-text` |
| `BayZustVAuslR` | 2 | `ambiguous-target/reverse-anchor-mismatch` | GVBl. 2026 S. 362 (§ 1): 3.: Nr. 6 ist nicht das letzte Glied seiner Art | `missing-predecessor-text` |
| `BayZustVKM` | 2 | `ambiguous-target/reverse-location-unresolved` | GVBl. 2026 S. 425 (§ 2): § 8 Abs. 1 Satz 1 Nr. 2 Buchst. a: Nr. 2 mehrfach vorhanden | `missing-predecessor-text` |
| `BayVV_7072_F_13921` | 3 | `ambiguous-target/reverse-target-ambiguous` | BayMBl. 2024 Nr. 350 (§ 1): 1. Satz 1: Anker mit eingefügtem Wortlaut „(eBAnz AT 17.05.2023 B6) in der jeweils geltenden Fassung“ kommt im Bereich 2-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVZBLH` | 4 | `ambiguous-target/reverse-end-not-determined` | GVBl. 2026 S. 487 (§ 2): 3. § 1: genau ein Textfeld verlangt, der Bereich hat 13 | `missing-predecessor-text` |
| `BayVwV235695` | 4 | `ambiguous-target/reverse-location-unresolved` | BayMBl. 2026 Nr. 104 (§ 1): 4. Abschnitt 1 Nr. 1.3 Satz 2 Buchst. c: Buchst. c nicht gefunden | `missing-predecessor-text` |
| `BayGZVJu` | 9 | `ambiguous-target/reverse-end-not-determined` | GVBl. 2025 S. 150 (§ 2): 1. a) § 49 Nr. 3: „am Ende“ setzt genau ein Textfeld voraus, der Bereich hat 2 | `missing-predecessor-text` |
| `BayVV_73_W_11032` | 1 | `round-trip-failed/reverse-target-not-found` | BayMBl. 2024 Nr. 665 (Nr. 1): 1.7 1.7.2 Nr. 2.2: eingefügter Satz „2Bei einem Direktauftrag sind in geeigneten Fällen auch KMU und Existenzgründung“ steht 0-mal an der genannten Stelle (erwartet: gena | `missing-predecessor-text` |
| `BayVV_2231_A_13823` | 2 | `round-trip-failed/reverse-target-not-found` | BayMBl. 2024 Nr. 639 (Nr. 1): 1.7 Nr. 10 Satz 2: neuer Wortlaut „den Bewilligungszeitraum 2025“ kommt im Bereich 0-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVV_2231_A_13834` | 2 | `round-trip-failed/reverse-target-not-found` | BayMBl. 2024 Nr. 634 (Nr. 1): 1.5 Nr. 5.1 Satz 5: neuer Wortlaut „2025“ kommt im Bereich 0-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayAbhGertArbV` | 1 | `effective-date-undetermined/commencement-unreadable` | GVBl. 1988 S. 329: PDF-Seite 1 trägt nicht Seitenzahl 329 mit Kopfzeile des GVBl. | `missing-predecessor-text` |
| `BayArchivG` | 1 | `effective-date-undetermined/commencement-unreadable` | GVBl. 1999 S. 521 (§ 16a): PDF-Seite 6 trägt nicht Seitenzahl 524 mit Kopfzeile des GVBl. | `missing-predecessor-text` |
| `BayEbFoeG` | 1 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2023 S. 501: Textlayer nicht verwertbar: Schrift – auf Seite 1 ohne sicher dekodierbare Kodierung | `missing-predecessor-text` |
| `BayGLKrWG` | 1 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2021 S. 74 (§ 5): Inkrafttretensvorschrift nicht lesbar: „Abweichend von Abs. 1 treten“ | `missing-predecessor-text` |
| `BayLKrSitzV` | 1 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2002 S. 987: Textlayer nicht verwertbar: Inhaltsstrom der Seite 1 nicht lesbar | `missing-predecessor-text` |
| `BayAGFlurbG` | 2 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2011 S. 689 (§ 39): Inkrafttretensvorschrift nicht lesbar: „Abweichend von Satz 1 treten §§ 9, 22, 26 Nr. 5 Buchst. b, §§ 32, 33 und 38 mit Wirkung vom 1. Januar 2011 und § 30 Nr. 1 mit Wirkung  | `missing-predecessor-text` |
| `BayFachVnVD` | 2 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2024 S. 465 (§ 1): Inkrafttretensvorschrift nicht lesbar: „Diese Verordnung tritt am 1. Oktober in Kraft.“ | `missing-predecessor-text` |
| `BayVwV_1140_S_069` | 2 | `effective-date-undetermined/commencement-unreadable` | BayMBl. 2021 Nr. 298: Inkrafttretensvorschrift nicht lesbar: „Abweichend von Satz 1 tritt Nr. 9a mit Wirkung vom 1. Mai 2020 in Kraft und tritt mit Ablauf des 31. Juli 2021 außer Kraft.“ | `missing-predecessor-text` |
| `SiTechZStV` | 2 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2025 S. 705 (§ 1): Inkrafttretensvorschrift nicht lesbar: „Dieses Abkommen tritt am Tag nach der letzten Verkündung in den Ländern in Kraft.“ | `missing-predecessor-text` |
| `BayQualVFL` | 3 | `effective-date-undetermined/commencement-unreadable` | GVBl. 2023 S. 518: Textlayer nicht verwertbar: Schrift – auf Seite 1 ohne sicher dekodierbare Kodierung | `missing-predecessor-text` |
| `BayVV_2023_I_2215` | 3 | `effective-date-undetermined/commencement-unreadable` | BayMBl. 2019 Nr. 327 (Nr. 1): Inkrafttretensvorschrift nicht lesbar: „Abweichend hiervon treten die Nrn. 1.3.3, 1.3.10, 1.3.15, 1.5.3, 1.5.17 und 1.5.24 am 1. Januar 2023 in Kraft; sie sind erstmals a | `missing-predecessor-text` |
| `BayDVLArztG` | 1 | `command-unreadable/location-unreadable` | GVBl. 2025 S. 21 (§ 1): Ortsangabe „Tabelle in Anlage 1“ nicht lesbar (3.) | `delete-words`, `missing-predecessor-text` |
| `BayFoStS` | 1 | `command-unreadable/location-unreadable` | GVBl. 2025 S. 122 (§ 1): Ortsangabe des Einleitungssatzes nicht lesbar: „Die Satzung“ | `recast`, `unrecognized`, `replace-words`, `missing-predecessor-text` |
| `BayVV_2272_UK_207` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2025 Nr. 6 (Nr. 1): Ortsangabe „Spiegelstrich 1 „Fahrtkosten““ nicht lesbar (1.10 1.10.1) | `recast`, `repeal-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayVV_61_02_03_01_F_13270` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2026 Nr. 296 (§ 1): Ortsangabe „Beispiel 1“ nicht lesbar (8. a)) | `repeal-unit`, `recast`, `unrecognized`, `insert-unit`, `missing-predecessor-text` |
| `BayVwV159082` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2026 Nr. 144 (Nr. 1): Ortsangabe „Inhaltsübersicht“ nicht lesbar (1.1) | `recast`, `unrecognized`, `insert-unit`, `missing-predecessor-text` |
| `BayVwV252304` | 1 | `command-unreadable/location-unreadable` | BayMBl. 2024 Nr. 474 (Nr. 1): Ortsangabe „Strafvollstreckungsordnung“ nicht lesbar (1.2) | `unrecognized`, `missing-predecessor-text` |
| `BayLTGO` | 2 | `command-unreadable/location-unreadable` | GVBl. 2024 S. 316 (§ 1): Ortsangabe „Inhaltsübersicht“ nicht lesbar (1.) | `recast`, `delete-words`, `repeal-unit`, `insert-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayVFprF` | 2 | `command-unreadable/location-unreadable` | GVBl. 2025 S. 4 (§ 1): Ortsangabe „Zweite Teil“ nicht lesbar (3.) | `recast`, `missing-predecessor-text` |
| `BayALFV` | 3 | `command-unreadable/location-unreadable` | GVBl. 2026 S. 58 (§ 1): Ortsangabe „Lfd. Nr. 16“ nicht lesbar (2. d)) | `recast`, `insert-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayGSO` | 3 | `command-unreadable/chain-block-not-found` | GVBl. 2026 S. 425 (§ 11): kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Ein Zitat wird bis zum Ende der Seite nicht geschlossen); die Änderung tritt nach dem Stichtag in  | `missing-predecessor-text` |
| `BayJG` | 3 | `command-unreadable/chain-block-not-found` | GVBl. 2024 S. 247 (§ 5): kein eindeutig lesbarer Änderungsbefehl für die Norm (intro-not-found: Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl); die Änderung tritt nach dem Stichtag i | `missing-predecessor-text` |
| `BayPAG` | 5 | `command-unreadable/chain-block-not-found` | GVBl. 2026 S. 139 (§ 5): kein eindeutig lesbarer Änderungsbefehl für die Norm (structure-unreadable: Ein Zitat wird bis zum Ende der Seite nicht geschlossen); die Änderung tritt nach dem Stichtag in K | `missing-predecessor-text` |
| `BayDVPOG` | 7 | `command-unreadable/chain-block-not-found` | GVBl. 2025 S. 53 (§ 1): kein eindeutig lesbarer Änderungsbefehl für die Norm; die Änderung tritt nach dem Stichtag in Kraft und müsste zurückgenommen werden | `missing-predecessor-text` |
| `BayDLR_StV` | 1 | `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Vierten Medienänderungsstaatsvertrag vom 9. bis 16. Mai 2023“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt | `missing-predecessor-text` |
| `BayVV_2032_4_K_942` | 1 | `missing-base/prior-source-unavailable` | Verkündung von „vom 16. Januar 2018 (KWMBl. S. 76)“ nicht verfügbar: keine Seite trägt das Ausfertigungsdatum 2018-01-16 (https://www.verkuendung-bayern.de/amtsblatt/?volume=2018&journal=4, https://ww | `missing-predecessor-text` |
| `BayVV_2330_B_12895` | 1 | `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 14. April 2023 (BayMBI. Nr. 217)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar | `missing-predecessor-text` |
| `BayVwV154721` | 1 | `missing-base/prior-source-unavailable` | Verkündung von „vom 13. Oktober 2017 (KWMBl. S. 439)“ nicht verfügbar: keine Seite trägt das Ausfertigungsdatum 2017-10-13 (https://www.verkuendung-bayern.de/amtsblatt/?volume=2017&journal=4, https:// | `missing-predecessor-text` |
| `JMStV` | 1 | `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Fünften Medienänderungsstaatsvertrag vom 27. Februar bis 7. März 2024“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt | `missing-predecessor-text` |
| `RFinStV` | 1 | `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „…“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt | `missing-predecessor-text` |
| `ZDF_StV` | 1 | `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Vierten Medienänderungsstaatsvertrag vom 9. bis 16. Mai 2023“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt | `missing-predecessor-text` |
| `BayLPO_II` | 2 | `missing-base/prior-source-not-on-platform` | Die genannte Änderung „§ 2 der Verordnung vom 27. Februar 2025 (GVBL. S. 58)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar | `missing-predecessor-text` |
| `BayVwV151756` | 2 | `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 17. Juni 2003 (KWMBl. I S. 260)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar | `missing-predecessor-text` |
| `MStV` | 7 | `missing-base/prior-treaty-without-reference` | Die vorangehende Änderung „den Fünften Medienänderungsstaatsvertrag vom 27. Februar bis 6. März 2024“ ist ohne Fundstelle zitiert (Staatsvertrag); ihre Verkündung ist so nicht bestimmt | `missing-predecessor-text` |
| `BayZustV` | 24 | `missing-base/prior-source-not-on-platform` | Die genannte Änderung „vom 11. Juli 2023 (GVBI. S. 463)“ ist nicht im GVBl. oder BayMBl. verkündet; ihre Verkündung ist auf der Verkündungsplattform nicht abrufbar | `missing-predecessor-text` |
| `BayAGBtG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 573 (§ 2): 2. „Art. 5 Abs. 1 Satz 3 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayAGWVG` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 667 (§ 2): 1. b) „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayAGZweigstV` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 548 (§ 1): 1. a) „In Nr. 3 wird die Angabe „i. UFr.“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayAVFwG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 159 (§ 23): „Die §§ 8 und 18 Abs. 3 sowie die Anlage 2 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayAbfAlG` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 75 (§ 52): 1. „In Art. 3 Abs. 6 wird die Angabe „nach dem Stand der Technik“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `missing-predecessor-text` |
| `BayAbfZustV` | 1 | `non-invertible-amendment/restore-annex-attachment` | GVBl. 2024 S. 458 (§ 2): Rückfall Anlage: die Anlage steht in der Verkündung (GVBl. 2022 S. 226) nur als PDF-Anhang („Anlage: Besondere Zuständigkeiten“) – kein Text der Seite | `missing-predecessor-text` |
| `BayAbgrG` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 619 (§ 6): „Art. 7 Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayAgrG` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2022 S. 695 (Art. 17a): 2. b) Art. 4 Satz 2: aufgehobener Satz über den Nachbarsatz der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayAufbauG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 190 (§ 8): 2. b) „Abs. 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayAuswVAM` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 406 (§ 1): 5. „Die Überschrift des bisherigen Teils 2 wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Aufhebu | `recast`, `insert-unit`, `missing-predecessor-text` |
| `BayBFSOMusik` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 298 (§ 7): 2. „§ 10 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `renumber`, `missing-predecessor-text` |
| `BayBGG` | 1 | `non-invertible-amendment/recast` | GVBl. 2026 S. 75 (§ 16): „Art. 18 Abs. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayBekV` | 1 | `non-invertible-amendment/recast` | GVBl. 2023 S. 655 (§ 1): 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayBodSchG` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 649 (§ 1): „Art. 15 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayBoersV` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 231 (§ 1): 3. a) „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `missing-predecessor-text` |
| `BayDVVersoG` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 75 (§ 14): 2. „In § 5 Abs. 2 Nr. 2 und § 9 Abs. 2 Satz 1 wird die Angabe „Abs. 1“ jeweils gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `missing-predecessor-text` |
| `BayEBV` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 573 (§ 5): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `recast`, `missing-predecessor-text` |
| `BayFBV` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 254 (§ 6): 1. „§ 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `renumber`, `missing-predecessor-text` |
| `BayFPO_II` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 472 (§ 2): 1. a) „Abs. 1 Satz 2 Nr. 1 und 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayFPrAgrHwV` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2021 S. 689 (§ 1): 7. „Die aus dem Anhang ersichtliche Anlage 4 wird angefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefüg | `missing-predecessor-text` |
| `BayFachVSozVerw` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 127 (§ 2): 1. a) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayFlbQualiV` | 1 | `non-invertible-amendment/restore-not-found` | GVBl. 2026 S. 302 (§ 1): 2. § 1 Abs. 4 Satz 1: kein Feld der Verkündung (GVBl. 2011 S. 35) wird durch Neufassen von § 1 Abs. 4 Satz 1 zeichengleich zum heutigen Feld | `missing-predecessor-text` |
| `BayFoG` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 114 (Art. 11): 1. b) „Abs. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayFwHOEzG` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2018 S. 257 (§ 1): 3. b) „Abs. 1 wird wie folgt gefasst:“: Befehl mit eigener Änderung und Untergliederung | `missing-predecessor-text` |
| `BayGSG` | 1 | `non-invertible-amendment/restore-not-found` | GVBl. 2024 S. 254 (§ 1): 9. c) Art. 11 Abs. 2: in der Verkündung (GVBl. 2010 S. 314) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayGnO` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2023 S. 600 (Nr. 1): 1.1 „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `container`, `unrecognized`, `missing-predecessor-text` |
| `BayGrKrV` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 47 (§ 1): 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `insert-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayGrStG` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: nach Rücknahme von 2 Änderung(en) vor dem Stichtag: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (GVBl. 2021 S. 638) weichen ab Zeichen 3517 ab | `missing-predecessor-text` |
| `BayHZG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 28): 1. „Abs. 4 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayHausuV` | 1 | `non-invertible-amendment/recast` | GVBl. 2026 S. 425 (§ 8): 1. b) aa) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `replace-words`, `missing-predecessor-text` |
| `BayHygV` | 1 | `non-invertible-amendment/recast` | GVBl. 2026 S. 66 (§ 1): 2. „§ 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayILSG` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2024 S. 636 (§ 1): 2. a) aa) „In Satz 1 werden die Wörter „in ihrem Leitstellenbereich“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `recast`, `missing-predecessor-text` |
| `BayIVUAbwWPBV` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 59): 1. b) „Satz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `renumber`, `missing-predecessor-text` |
| `BayKUV` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 573 (§ 7): 2. „§ 22 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayKommHV` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 21 (§ 1): 2. „§ 79 Abs. 2 Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayKommPrV` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 365 (§ 1): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `recast`, `missing-predecessor-text` |
| `BayKrVerguetV` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 94 (§ 1): 1. a) „Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayKraSO` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 425 (§ 9): 5. c) bb) „Halbsatz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `delete-words`, `unrecognized`, `replace-words`, `renumber`, `missing-predecessor-text` |
| `BayLGLV` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 30 (§ 2): 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `replace-by-punctuation`, `missing-predecessor-text` |
| `BayLPO_I` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 58 (§ 1): 2. „In § 3 Abs. 3 Satz 2 wird das Wort „Neugriechisch,“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `repeal-unit`, `unrecognized`, `replace-by-punctuation`, `insert-unit`, `missing-predecessor-text` |
| `BayLRAuszG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 19): 2. b) „Abs. 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayLaborV` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (GVBl. 2010 S. 777) weichen ab Zeichen 6206 ab: Portal „…asUnterschreitenderDeckungssummedernach§4 | `missing-predecessor-text` |
| `BayLfFV` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 146 (§ 3): 1. a) aa) aaa) „Die Angabe „München,“ wird gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `missing-predecessor-text` |
| `BayMaxOG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 633 (§ 1): 10. c) „Abs. 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayMaxOStat` | 1 | `non-invertible-amendment/recast` | GVBl. 2026 S. 538 (§ 1): 2. b) „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `missing-predecessor-text` |
| `BayMediend_StVAG` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 584 (§ 3): 2. „Art. 1 Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayMfG2008` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 11): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayNatLandAkV` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 337 (§ 1): 1. b) „Satz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `missing-predecessor-text` |
| `BayPolBilG` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 254 (§ 7): „Art. 1 Abs. 1 Satz 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayPrVProfV` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 402 (§ 1): 1. c) „Der Satzteil vor Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayPsychKHG` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 24): „Art. 4 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayRiStAG` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2021 S. 654 (§ 3): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl – aus der Ve | `missing-predecessor-text` |
| `BaySchallzVO` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 25 (§ 1): 1. a) „Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `unrecognized`, `missing-predecessor-text` |
| `BaySchiffSvEV` | 1 | `non-invertible-amendment/recast` | GVBl. 2025 S. 88 (§ 1): 1. a) aa) „Satz 1 Nr. 1 bis 5 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayStudAkkV` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (GVBl. 2018 S. 264) weichen ab Zeichen 23907 ab: Portal „…rQualitätsmanagementsystemeisteineSystem | `missing-predecessor-text` |
| `BayVGemO` | 1 | `non-invertible-amendment/recast` | GVBl. 2023 S. 385 (§ 9): 4. c) „Abs. 3 Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `insert-words`, `missing-predecessor-text` |
| `BayVSG` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 75 (§ 41): 1. „In Art. 10 Abs. 2 Satz 2 und 3 wird die Angabe „nach dem Stand der Technik“ jeweils gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `missing-predecessor-text` |
| `BayVV2248K746` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2026 Nr. 259 (Nr. 1): 1.1 „Die Fußnote 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `delete-words`, `recast`, `unrecognized`, `missing-predecessor-text` |
| `BayVVPStG` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 107 (§ 1): 2. „§ 6 Abs. 2 Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVV_1102_F_10160` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag BayMBl. 2021 Nr. 924 (Nr. 1): 1.3 Nr. 3.1.1 Satz 1: neuer Wortlaut „22 000 €“ kommt im Bereich 0-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVV_12_I_2272` | 1 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 492 (Nr. 1): 1.1 „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayVV_2030_2_3_K_11961` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 463 (Nr. 1): 1.2 1.2.2 „In Nr. 3.2 wird der Wortlaut nach der Überschrift aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl – aus der Verkündung nicht wiederhers | `delete-words`, `recast`, `missing-predecessor-text` |
| `BayVV_2030_K_10189` | 1 | `non-invertible-amendment/delete-words` | BayMBl. 2024 Nr. 479 (Nr. 1): 1.1 „In Nr. 1.1 wird die Angabe „1.1.2.8. und“ gestrichen und die Angabe „1.12“ durch die Angabe „1.11“ ersetzt.“: Streichung ohne Anker: der Wortlaut ist bekannt, die St | `unrecognized`, `missing-predecessor-text` |
| `BayVV_2034_4_U_13020` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (BayMBl. 2022 Nr. 331) weichen ab Zeichen 5001 ab: Portal „…§§5und12bis14derVerordnungzurÜbertragu | `missing-predecessor-text` |
| `BayVV_2034_J_181` | 1 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 441 (Nr. 1): 1.1 „Der Titel wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `unrecognized`, `missing-predecessor-text` |
| `BayVV_2038_3_3_2_J_184` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 319 (Nr. 1): 1.2 1.2.2 „Nr. 1.1.2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `unrecognized`, `missing-predecessor-text` |
| `BayVV_2126_1_G_12555` | 1 | `non-invertible-amendment/restore-shape` | BayMBl. 2024 Nr. 659 (Nr. 1): Rückfall Nr. 1.2: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; item>item\|label+text\|{}\| | `missing-predecessor-text` |
| `BayVV_2162_A_10911` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 644 (Nr. 1): 1.6 1.6.3 Nr. 4.4.2 Satz 3: aufgehobener Satz über den Nachbarsatz der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayVV_2173_A_11662` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (BayMBl. 2020 Nr. 776) weichen ab Zeichen 8815 ab: Portal „…Berndl,VorstandVerbands-undSozialpolit | `missing-predecessor-text` |
| `BayVV_2175_4_G_10792` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag BayMBl. 2022 Nr. 640 (Nr. 1): 1.1 „In der Überschrift zu Nr. 1 wird nach dem Wort „Kurzzeit-,“ das Wort „Verhinderungs-,“ eingefügt, nach dem | `missing-predecessor-text` |
| `BayVV_2191_F_1024` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2025 Nr. 315 (§ 1): 3. b) dd) eee) Satz 2 Nr. 2 Satz 2 Buchst. e: in der Verkündung (FMBl. 2017 S. 322) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayVV_2193_F_11308` | 1 | `non-invertible-amendment/restore-shape` | BayMBl. 2024 Nr. 46 (§ 1): Rückfall Nr. 10.1: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; item>item\|label+text\|{}\|de | `missing-predecessor-text` |
| `BayVV_2230_1_1_1_1_K_13367` | 1 | `non-invertible-amendment/delete-words` | BayMBl. 2026 Nr. 128 (Nr. 1): 1.4 1.4.2 1.4.2.4 „In Satz 5 wird die Angabe „in der lokalen Koordinierungsgruppe Witterung“ gestrichen und im ersten Spiegelstrich nach der Angabe „Katastroph“: Streichu | `unrecognized`, `missing-predecessor-text` |
| `BayVV_2231_A_10881` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 635 (Nr. 1): 1.5 Nr. 9 Satz 2: Stelle von „betrifft den Bewilligungszeitraum bis 31. Dezember 2024 und“ über den umgebenden Wortlaut der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayVV_2234_1_K_13087` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag BayMBl. 2023 Nr. 126 (Nr. 1): 1.2 „In Nr. 8 Satz 2 wird die Regelung für den Bereich des Aufsichtsbezirks München wie folgt gefasst:“: Neufas | `missing-predecessor-text` |
| `BayVV_2272_UK_209` | 1 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 125 (Nr. 1): 1.1 „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `delete-words`, `insert-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayVV_237_B_10540` | 1 | `non-invertible-amendment/delete-words` | BayMBl. 2024 Nr. 627 (Nr. 1): 1.2 1.2.1 „In Satz 1 wird die Angabe „Anlage 3“ durch die Angabe „VV“ ersetzt und die Wörter „der Verwaltungsvorschriften für Zuwendungen des Freistaat“: Streichung ohne  | `recast`, `missing-predecessor-text` |
| `BayVV_66_F_11402` | 1 | `non-invertible-amendment/recast` | BayMBl. 2024 Nr. 456 (§ 1): 4. a) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `unrecognized`, `replace-words`, `missing-predecessor-text` |
| `BayVV_7012_1_F_12963` | 1 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 188 (§ 1): 10. a) „Satz 1 wird Nr. 6.2.1 und wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Satz 1 wird N | `unrecognized`, `insert-unit`, `missing-predecessor-text` |
| `BayVV_7072_1_W_12957` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 313 (Nr. 1): 1.1 Vorbemerkung Satz 1: kein Feld der Verkündung (BayMBl. 2022 Nr. 246) wird durch Neufassen von Vorbemerkung Satz 1 zeichengleich zum heutigen Feld | `missing-predecessor-text` |
| `BayVV_73_I_11993` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 327 (Nr. 1): 1.4 „Nr. 7.1.8 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `delete-words`, `recast`, `insert-unit`, `missing-predecessor-text` |
| `BayVV_73_I_2325` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2025 Nr. 11 (Nr. 1): 1.5 „Die Nrn. 1.2.1 bis 1.2.6 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `delete-words`, `unrecognized`, `missing-predecessor-text` |
| `BayVV_7523_W_13569` | 1 | `non-invertible-amendment/restore-new-mismatch` | BayMBl. 2025 Nr. 544 (Nr. 1): 1.14 Nr. 9: das neu gefasste Glied im heutigen Text ist nicht wörtlich der zitierte Wortlaut | `missing-predecessor-text` |
| `BayVV_7803_1_L_10832` | 1 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 75 (Nr. 1): 1.9 „Der Spiegelstrich erhält folgende neue Fassung:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Spiegelstric | `insert-unit`, `unrecognized`, `renumber`, `missing-predecessor-text` |
| `BayVV_7803_2_L_10662` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2026 Nr. 66 (Nr. 1): 1.10 Nr. 8.7 Spiegelstrich 2: in der Verkündung (BayMBl. 2019 Nr. 397) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayVV_787_L_13831` | 1 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 224 (Nr. 1): 1.10 1.10.1 „Der Satz erhält folgende neue Fassung:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Satz“ nicht  | `unrecognized`, `renumber`, `missing-predecessor-text` |
| `BayVV_787_L_13877` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (BayMBl. 2023 Nr. 340) weichen ab Zeichen 197 ab: Portal „…iften(VV)und-Verordnung(EU)Nr.1407/2013 | `missing-predecessor-text` |
| `BayVV_7912_1_U_13349` | 1 | `non-invertible-amendment/restore-shape` | BayMBl. 2025 Nr. 589 (Nr. 1): Rückfall Nr. 1: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; (Norm)>item\|label+text\|{}\| | `missing-predecessor-text` |
| `BayVV_806_G_11201` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 526 (Nr. 1): Rückfall § 27: in der Verkündung (BayMBl. 2020 Nr. 327) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayVV_861_G_10013` | 1 | `non-invertible-amendment/delete-words` | BayMBl. 2024 Nr. 650 (Nr. 1): 1.1 „In Nr. 1.1.1 Satz 2 werden die Wörter „in der Regel“ durch das Wort „regelmäßig“ ersetzt und die Wörter „wöchentlich oder 14-tägig“ gestrich“: Streichung ohne Anker: | `recast`, `repeal-unit`, `renumber`, `missing-predecessor-text` |
| `BayVergV_LPO_I` | 1 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 153 (§ 1): 2. a) aa) „Im Satzteil vor Nr. 1 wird die Angabe „ , Didaktik der Naturwissenschaft und Technik“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nich | `recast`, `repeal-unit`, `missing-predecessor-text` |
| `BayVwV152073` | 1 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 25 (Nr. 1): 1.2 „Nrn. 1.2 und 1.3 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVwV154359` | 1 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 273 (Nr. 1): 1.1 „Nr. 1.1.1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayVwV231141` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2024 Nr. 84 (§ 1): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `unrecognized`, `replace-words`, `missing-predecessor-text` |
| `BayVwV251529` | 1 | `non-invertible-amendment/recast` | BayMBl. 2024 Nr. 198 (§ 1): 1. „Der Wortlaut vor Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayVwV257002` | 1 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag BayMBl. 2023 Nr. 439 (§ 1): 8. Nr. 9 Satz 2: aufgehobener Satz über den Nachbarsatz der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayVwV257012` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 362 (§ 1): 13. Nr. 8 Satz 2: aufgehobener Satz über den Nachbarsatz der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayVwV288393` | 1 | `non-invertible-amendment/delete-words` | BayMBl. 2025 Nr. 124 (Nr. 1): 1.1 „In § 3 Abs. 1 Satz 3 werden die Wörter „allgemein oder“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayVwV290863` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 624 (Nr. 1): 1.9 1.9.1 Nr. 2.2 Satz 1: kein Feld der Verkündung (JMBl. 2014 S. 146) wird durch Neufassen von Nr. 2.2 Satz 1 zeichengleich zum heutigen Feld | `missing-predecessor-text` |
| `BayVwV312206` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (KWMBl. 2015 S. 95) weichen ab Zeichen 730 ab: Portal „…MaßgabederEntfernungskilometerzurörtlicham | `missing-predecessor-text` |
| `BayVwV96547` | 1 | `non-invertible-amendment/repeal-unit` | BayMBl. 2024 Nr. 149 (Nr. 1): 1.1 1.1.1 „Nr. 2.2.2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `delete-words`, `missing-predecessor-text` |
| `BayVwZVG` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 599 (§ 2): 4. „Art. 15 Abs. 1 Satz 1 Nr. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayWkKV` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 573 (§ 6): 1. „Die Sätze 1 und 2 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayWkPV` | 1 | `non-invertible-amendment/recast` | GVBl. 2024 S. 573 (§ 8): 1. „Die Sätze 1 und 2 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayZustWaffVIM` | 1 | `non-invertible-amendment/restore-not-found` | BayMBl. 2024 Nr. 508 (§ 1): 4. c) § 4 Abs. 2: in der Verkündung (GVBl. 2011 S. 74) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayZwEWG2008` | 1 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 110 (§ 1): 3. b) „Satz 5 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `renumber`, `missing-predecessor-text` |
| `BayeAktVV` | 1 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (GVBl. 2023 S. 13) weichen ab Zeichen 132 ab: Portal „…19.März1991(BGBl.IS.686),diezuletztdurchdes | `missing-predecessor-text` |
| `BayAGO` | 2 | `non-invertible-amendment/recast` | GVBl. 2026 S. 259 (§ 1): 3. b) bb) „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayAVWpG` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 269 (§ 1): 1. a) „Buchst. d wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayAbgG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 78 (§ 2): „Art. 25 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayAnerkV` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 75 (§ 1): 1. b) „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `unrecognized`, `replace-words`, `missing-predecessor-text` |
| `BayBoFiV` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 537 (§ 1): 2. „In § 11 Abs. 2 Nr. 2 wird die Angabe „ . “ am Ende durch folgende Angabe ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext | `delete-words`, `unrecognized`, `missing-predecessor-text` |
| `BayDSG` | 2 | `non-invertible-amendment/restore-new-mismatch` | GVBl. 2025 S. 254 (§ 2): 1. Art. 39a, Art. 39b: das aufgehobene Glied steht noch im heutigen Text | `missing-predecessor-text` |
| `BayDVKrG` | 2 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 98 (§ 2): 4. a) aa) „In Nr. 2 werden die Wörter „mit Nachweis der aus Förderleistungen erzielten Zinsen“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `repeal-unit`, `missing-predecessor-text` |
| `BayFachVLw` | 2 | `non-invertible-amendment/delete-words` | GVBl. 2024 S. 157 (§ 1): 1. a) „In Satz 1 werden die Wörter „von etwa 15 Minuten“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `repeal-unit`, `renumber`, `missing-predecessor-text` |
| `BayFachVStF` | 2 | `non-invertible-amendment/delete-words` | GVBl. 2024 S. 409 (§ 1): 1. „In § 10 Abs. 1 Satz 2 wird das Wort „schriftlichen“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `insert-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayFischG` | 2 | `non-invertible-amendment/recast` | GVBl. 2024 S. 619 (§ 11): 1. a) „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `delete-words`, `renumber`, `unrecognized`, `missing-predecessor-text` |
| `BayFoelSO` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 272 (§ 15): 1. a) „Der Wortlaut wird Satz 1 und Nr. 2 wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayForschStG` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 102 (§ 1): 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `insert-unit`, `renumber`, `missing-predecessor-text` |
| `BayFwG` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 215 (§ 1): 1. „Art. 1 Abs. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `insert-unit`, `renumber`, `missing-predecessor-text` |
| `BayGAPV` | 2 | `non-invertible-amendment/recast` | GVBl. 2025 S. 158 (§ 1): 1. a) „Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `delete-words`, `unrecognized`, `missing-predecessor-text` |
| `BayGastV` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2016 S. 306: 1. „Nach § 3 wird folgender § 3a eingefügt:“: Eingefügtes Glied: Ort, Bezeichnung oder Zitat nicht lesbar | `missing-predecessor-text` |
| `BayHKaG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 632 (§ 2): 7. „Die Art. 103 und 104 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayJAPO` | 2 | `non-invertible-amendment/recast` | GVBl. 2026 S. 195 (§ 1): 2. a) aa) „Satz 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `missing-predecessor-text` |
| `BayKG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 254 (§ 1): 1. a) „Abs. 2 Satz 4 und 5 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `delete-words`, `missing-predecessor-text` |
| `BayKVzKG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 311 (§ 2): 1. „Die Tarif-Nr. 4.II.1/ wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `unrecognized`, `missing-predecessor-text` |
| `BayKWBG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 170 (§ 14): 2. „Art. 54 Abs. 3 Satz 4 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayLandStG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 474 (§ 2): 1. a) „Satz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `delete-words`, `missing-predecessor-text` |
| `BayLandesBG` | 2 | `non-invertible-amendment/recast` | GVBl. 2024 S. 585 (§ 3): 1. a) „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `repeal-unit`, `missing-predecessor-text` |
| `BayNV` | 2 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 559 (§ 1): 3. a) „In Abs. 1 wird die Angabe „schriftlichen“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `missing-predecessor-text` |
| `BayNotarV` | 2 | `non-invertible-amendment/recast` | GVBl. 2024 S. 546 (§ 2): 1. „§ 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayRDG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 37): 1. a) „Satz 3 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayStatG` | 2 | `non-invertible-amendment/recast` | GVBl. 2026 S. 374 (§ 9): 2. „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayUVollzG` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2022 S. 642 (§ 2): 3. Art. 36 Nr. 2: neuer Wortlaut „Satz“ kommt im Bereich 2-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayVV_2030_2_2_U_13853` | 2 | `non-invertible-amendment/restore-not-found` | BayMBl. 2026 Nr. 301 (Nr. 1): Rückfall Nr. 3.1.2 Buchst. m: in der Verkündung (BayMBl. 2023 Nr. 311) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayVV_2126_0_G_11619` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag BayMBl. 2022 Nr. 590 (§ 1): 2. 2.3 Nr. 11 Sätze 2, 3: kein Feld der Verkündung (BayMBl. 2020 Nr. 729) wird durch Aufheben von Nr. 11 Sätze 2, | `missing-predecessor-text` |
| `BayVV_2160_A_11301` | 2 | `non-invertible-amendment/restore-not-found` | BayMBl. 2026 Nr. 280 (Nr. 1): 1.7 1.7.3 Nr. 7.1 Satz 5: aufgehobener Satz über den Nachbarsatz der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayVV_2236_4_K_10479` | 2 | `non-invertible-amendment/delete-words` | BayMBl. 2026 Nr. 194 (Nr. 1): 1.2 1.2.1 „Im ersten Spiegelstrich wird die Angabe „Altenpflege,“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `unrecognized`, `missing-predecessor-text` |
| `BayVV_7070_W_10427` | 2 | `non-invertible-amendment/restore-new-mismatch` | BayMBl. 2024 Nr. 243 (Nr. 1): 1.4 Nr. 3: das neu gefasste Glied im heutigen Text ist nicht wörtlich der zitierte Wortlaut | `missing-predecessor-text` |
| `BayVV_7070_W_11463` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag BayMBl. 2023 Nr. 357 (Nr. 1): 1.4 1.4.2 „In Nr. 8.1 wird die Angabe „2023“ durch die Angabe „2026“ ersetzt und die Gliederungsnummer „8.1“ ge | `missing-predecessor-text` |
| `BayVV_7071_W_10442` | 2 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 540 (Nr. 1): 1.1 „Nr. 6.2.1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `insert-unit`, `missing-predecessor-text` |
| `BayVV_787_L_13956` | 2 | `non-invertible-amendment/restore-shape` | BayMBl. 2025 Nr. 376 (Nr. 1): Rückfall Nr. 6.3: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; item>table\|\|{}\|\|geglied | `missing-predecessor-text` |
| `BayVermGeoLEV_4QE` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 543 (§ 1): 2. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Inhaltsübersi | `missing-predecessor-text` |
| `BayVfGHG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2024 S. 246 (§ 1): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `recast`, `delete-words`, `missing-predecessor-text` |
| `BayVwV153983` | 2 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 363 (Nr. 1): „VV zu Art. 96 BayStVollzG wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVwV153994` | 2 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 294 (Nr. 1): 1.1 „Nr. 2.1 wird wie folgt neu gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVwV232531` | 2 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 400 (§ 1): „Abschnitt II Nr. 3.9 Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVwV294809` | 2 | `non-invertible-amendment/delete-words` | BayMBl. 2025 Nr. 311 (Nr. 1): 1.2 1.2.1 „In Satz 1 wird die Angabe „(www.stmgp.bayern.de/meine-themen/fuer-fach-und-pflegekraefte/)“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die  | `repeal-unit`, `recast`, `insert-unit`, `unrecognized`, `missing-predecessor-text` |
| `BayVwV96746` | 2 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 524 (Nr. 1): „Nr. 5 erhält folgenden Wortlaut:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayZALS` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 425 (§ 18): 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayZAPOFI` | 2 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (GVBl. 2022 S. 553) weichen ab Zeichen 23369 ab: Portal „…folgtunterBeachtungdesAnonymitätsprinzip | `missing-predecessor-text` |
| `BayZAPOJ` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2022 S. 680 (§ 2): 7. c) § 56 Abs. 2: Stelle des aufgehobenen Glieds im heutigen Text nicht bestimmt (kein gleichlautendes Nachbarglied | `missing-predecessor-text` |
| `BayZustG` | 2 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 190 (§ 1): 1. „Art. 9 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayZustVFM` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2022 S. 400 (§ 1): 4. § 4 Nr. 3: neuer Wortlaut „Nr. 2 bis 5“ kommt im Bereich 0-mal vor (erwartet: genau einmal) | `missing-predecessor-text` |
| `BayZustVWFKM` | 2 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2018 S. 835: 1. Überschrift der Norm: Geänderte Überschrift „Verordnung über dienstrechtliche Zuständigkeiten im Geschäftsbereich des B | `missing-predecessor-text` |
| `BayAVPfleWoqG` | 3 | `non-invertible-amendment/restore-shape` | GVBl. 2024 S. 662 (§ 1): Rückfall § 66: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; subparagraph>table\|\|{}\|\|geglied | `missing-predecessor-text` |
| `BayBFHG` | 3 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 20): „Art. 15 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayFachVVermGeo` | 3 | `non-invertible-amendment/restore-not-found` | GVBl. 2026 S. 2 (§ 1): Rückfall § 59 Abs. 5: in der Verkündung (GVBl. 2012 S. 493) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayHO` | 3 | `non-invertible-amendment/recast` | GVBl. 2025 S. 254 (§ 8): 2. b) „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `missing-predecessor-text` |
| `BayHeilvfV` | 3 | `non-invertible-amendment/restore-not-found` | GVBl. 2023 S. 577 (§ 1): Rückfall § 16 Abs. 2: in der Verkündung (GVBl. 2010 S. 865) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayImSchG` | 3 | `non-invertible-amendment/restore-not-found` | GVBl. 2024 S. 619 (§ 3): 3. b) cc) Art. 12 Abs. 1 Satz 2: aufgehobener Satz über den Nachbarsatz der Verkündung nicht gefunden | `missing-predecessor-text` |
| `BayKrG` | 3 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 98 (§ 1): 1. a) „In Satz 1 werden die Wörter „auf Antrag“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `repeal-unit`, `replace-by-punctuation`, `missing-predecessor-text` |
| `BayLfLV` | 3 | `non-invertible-amendment/recast` | GVBl. 2026 S. 58 (§ 2): 1. „§ 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `delete-words`, `missing-predecessor-text` |
| `BayLplG` | 3 | `non-invertible-amendment/restore-not-found` | GVBl. 2026 S. 75 (§ 7): Rückfall Art. 21 Abs. 4 Nr. 2: in der Verkündung (GVBl. 2012 S. 254) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayNatSchG` | 3 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 15): 1. „Art. 3a wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayOePNVG` | 3 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 75 (§ 38): 1. „In Art. 4 Abs. 3 Satz 1 wird die Angabe „dem Stand der Technik und“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `missing-predecessor-text` |
| `BayPOG` | 3 | `non-invertible-amendment/recast` | GVBl. 2026 S. 139 (§ 6): „Art. 7 Abs. 1 Satz 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayRSO` | 3 | `non-invertible-amendment/recast` | GVBl. 2026 S. 425 (§ 10): 6. „§ 17 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `repeal-unit`, `delete-words`, `unrecognized`, `missing-predecessor-text` |
| `BaySchBefV` | 3 | `non-invertible-amendment/repeal-unit` | GVBl. 2025 S. 610 (§ 1): 1. „§ 2 Abs. 1 Satz 6 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BaySchulgespflV` | 3 | `non-invertible-amendment/recast` | GVBl. 2026 S. 75 (§ 4): „§ 10 Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVV_2023_I_2281` | 3 | `non-invertible-amendment/recast` | BayMBl. 2024 Nr. 496 (Nr. 1): 1.1 „Anlage 2 Gruppe 00 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl – aus der Verkündung nicht wiederherstellbar: Ortsangabe „Anlage 2 Gruppe  | `missing-predecessor-text` |
| `BayVV_2033_6_F_10463` | 3 | `non-invertible-amendment/restore-shape` | BayMBl. 2026 Nr. 58 (§ 1): Rückfall Nr. 1.3: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; section>table\|\|{}\|\|geglied |  |
| `BayVV_2235_1_1_1_K_13727` | 3 | `non-invertible-amendment/location-unresolved` | BayMBl. 2026 Nr. 319 (Nr. 1): 1.1 Überschrift: Überschrift der Norm selbst: gehört zu den Metadaten, nicht zum Körper | `missing-predecessor-text` |
| `BayVwV154007` | 3 | `non-invertible-amendment/recast` | BayMBl. 2026 Nr. 212 (Nr. 1): „Abschnitt IV Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVwV246830` | 3 | `non-invertible-amendment/restore-not-found` | BayMBl. 2026 Nr. 219 (§ 1): Rückfall Abschnitt I Nr. 4.3: in der Verkündung (FMBl. 2011 S. 4) nicht eindeutig gefunden | `missing-predecessor-text` |
| `BayVwV96787` | 3 | `non-invertible-amendment/recast` | BayMBl. 2025 Nr. 285 (Nr. 1): 1.1 „Abschnitt II Nr. 1 wird wie folgt neu gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayVwV97112` | 3 | `non-invertible-amendment/delete-words` | BayMBl. 2026 Nr. 161 (Nr. 1): „In Satz 1 der Einleitung wird die Angabe „durch zinsverbilligte Darlehen“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `missing-predecessor-text` |
| `BayZVEnEV` | 3 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 149 (§ 1): 1. „§ 4 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `recast`, `missing-predecessor-text` |
| `BayeAktFGV` | 3 | `non-invertible-amendment/restoration-disagrees` | Alttext aus der Stammverkündung: Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (GVBl. 2019 S. 548) weichen ab Zeichen 191 ab: Portal „…rt.5Abs.8desGesetzesvom21.Juni2019(BGBl.IS | `missing-predecessor-text` |
| `BayDSchG` | 4 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 657 (§ 1): 2. a) aa) „Die Angabe „(1)“ wird gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `recast`, `unrecognized`, `missing-predecessor-text` |
| `BayFAG` | 4 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 250 (§ 1): 3. „Art. 6 Satz 3 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayFAGDV02` | 4 | `non-invertible-amendment/delete-words` | GVBl. 2024 S. 153 (§ 3): 2. „In Abs. 2 wird die Angabe „ , 13a und 13b Abs. 1“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `repeal-unit`, `missing-predecessor-text` |
| `BayGDG` | 4 | `non-invertible-amendment/restoration-prior-reverse` | Alttext aus der Stammverkündung: Änderung vor dem Stichtag GVBl. 2023 S. 431 (§ 2): 2. b) Art. 17 Abs. 1: Anker mit eingefügtem Wortlaut „Hebammen, § 8 Abs. 1 Satz 1 Nr. 4 der MT-Ausbildungs- und Prüf | `missing-predecessor-text` |
| `BayUrlMV` | 4 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 561 (§ 1): 1. a) „In Nr. 4 wird die Angabe „für Zwecke der Landesverteidigung sowie“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `missing-predecessor-text` |
| `BayVV_787_L_13932` | 4 | `non-invertible-amendment/restore-shape` | BayMBl. 2025 Nr. 361 (Nr. 1): Rückfall Nr. 4.2: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; section>item\|label+text\|{ | `missing-predecessor-text` |
| `BayVwV233801` | 4 | `non-invertible-amendment/repeal-unit` | BayMBl. 2026 Nr. 215 (§ 2): 1. „Die Nrn. 16.4 bis 16.4.4 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayWaldG` | 4 | `non-invertible-amendment/repeal-unit` | GVBl. 2026 S. 75 (§ 35): „Art. 25 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl | `missing-predecessor-text` |
| `BayZustWiG` | 4 | `non-invertible-amendment/recast` | GVBl. 2025 S. 663 (§ 1): 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl | `missing-predecessor-text` |
| `BayBauGBZustV` | 5 | `non-invertible-amendment/delete-words` | GVBl. 2026 S. 75 (§ 5): 1. „In Abs. 1 wird die Angabe „Nr. 1“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `missing-predecessor-text` |
| `BayMeldDV` | 6 | `non-invertible-amendment/restore-shape` | GVBl. 2025 S. 549 (§ 1): Rückfall § 10 Abs. 1: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut; subparagraph>table\|\|{}\|\| | `missing-predecessor-text` |
| `BayDBauV` | 20 | `non-invertible-amendment/restore-no-change` | GVBl. 2025 S. 607 (§ 1): Rückfall § 1 Abs. 2 Nr. 1: das Glied der Verkündung ist das heutige | `missing-predecessor-text` |
| `BayZustV_Bezuege` | 11 | `non-invertible-amendment/delete-words` | GVBl. 2025 S. 578 (§ 1): 2. „In Nr. 1 wird die Angabe „mit Ausnahme der Regierung von Oberbayern“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht | `recast`, `missing-predecessor-text` |

### baseline-only predecessor (3)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayVV_2176_I_14046` | 0 | `missing-base/no-post-baseline-event` | Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt | `stammfassung-in-force-after-baseline` |
| `BayVV_2230_7_K_14059` | 0 | `missing-base/no-post-baseline-event` | Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt | `stammfassung-in-force-after-baseline` |
| `BayVV_7072_1_W_14082` | 0 | `missing-base/no-post-baseline-event` | Weder ein Vollzitat mit letzter Änderung noch ein Ereignis nach dem Stichtag: die Kette ist unbekannt | `stammfassung-in-force-after-baseline` |

### contradictory evidence (33)

| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |
| --- | ---: | --- | --- | --- |
| `BayAGGlueStV` | 0 | `contradictory/chain-no-post-baseline-amendment` | Die letzte Änderung (GVBl. 2022 S. 147) trat vor dem Stichtag in Kraft; eine spätere, die den heutigen Text trägt, nennt die Kette nicht |  |
| `BayDVAsyl` | 0 | `contradictory/chain-no-post-baseline-amendment` | Die letzte Änderung (GVBl. 2023 S. 616) trat vor dem Stichtag in Kraft; eine spätere, die den heutigen Text trägt, nennt die Kette nicht |  |
| `BaySenG_2023` | 0 | `contradictory/portal-in-force-unexplained` | Das Vollzitat nennt keine Änderung und das Register kein Ereignis, der Text gilt laut Paket aber erst seit 2024-04-01; die eigene Inkrafttretensvorschrift nennt 2023-04-01 – welche Änderung den Text t |  |
| `BayZAPO_FoeLII` | 0 | `contradictory/chain-no-post-baseline-amendment` | Die letzte Änderung (GVBl. 2022 S. 685) trat vor dem Stichtag in Kraft; eine spätere, die den heutigen Text trägt, nennt die Kette nicht |  |
| `StVVLastTStV` | 0 | `contradictory/portal-in-force-unexplained` | Das Vollzitat nennt keine Änderung und das Register kein Ereignis, der Text gilt laut Paket aber erst seit 2025-01-01; die eigene Inkrafttretensvorschrift belegt das nicht (2 Vorschriften „Inkrafttret |  |
| `BayBauKaG` | 1 | `contradictory/chain-prior-history-mismatch` | Die letzte Änderung vor der Kette (GVBl. 2023 S. 327) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („11. § 2 G zur Änderung des Bayerischen Berufsqualifikationsfeststellungsgesetz | `missing-predecessor-text` |
| `BayErwSchLV` | 1 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-08-01, die jüngste Änderung GVBl. 2025 S. 491 tritt am 2025-10-01 in Kraft | `missing-predecessor-text` |
| `BayIntG` | 1 | `contradictory/chain-prior-history-mismatch` | Die letzte Änderung vor der Kette (GVBl. 2019 S. 98) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („3. Entsch. des BayVerfGH – 2019 Vf. 6-VIII-17; Vf. 7-VIII-17 - vom 3.12.2019 (G | `missing-predecessor-text` |
| `BayVV_2030_2_3_K_12038` | 1 | `contradictory/chain-history-mismatch` | Änderungsverlauf führt BayMBl. 2025 Nr. 462 nicht | `image-replacement`, `missing-predecessor-text` |
| `BayAGGVG` | 2 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-04-01, die jüngste Änderung GVBl. 2026 S. 379 tritt am 2026-08-01 in Kraft | `missing-predecessor-text` |
| `BayDG` | 2 | `contradictory/chain-history-mismatch` | Änderungsverlauf führt GVBl. 2024 S. 619 nicht | `missing-predecessor-text` |
| `BayEBG` | 2 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2025-08-01, die jüngste Änderung GVBl. 2026 S. 75 tritt am 2026-04-01 in Kraft | `missing-predecessor-text` |
| `BayFachVJ` | 2 | `contradictory/portal-in-force-lag` | Der heutige Text gilt laut Paket seit 2024-12-17; GVBl. 2025 S. 585 (§ 1) (in Kraft 2025-12-01) ist darin noch nicht eingearbeitet – die nächstältere Änderung GVBl. 2024 S. 588 trat genau an diesem Ta | `missing-predecessor-text` |
| `BayGlG` | 2 | `contradictory/chain-prior-history-mismatch` | Die letzte Änderung vor der Kette (GVBl. 2006 S. 292) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („2. § 1 G zur Änd. des Bayerischen GleichstellungsGs vom 23.5.2006 (GVBl S. 292 | `missing-predecessor-text` |
| `BayMRVG` | 2 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2025-12-01, die jüngste Änderung GVBl. 2026 S. 75 tritt am 2026-04-01 in Kraft | `missing-predecessor-text` |
| `BayStVollzG` | 2 | `contradictory/chain-prior-history-mismatch` | Die letzte Änderung vor der Kette (GVBl. 2022 S. 718) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („13. Urt. des BVerfG – 2 BvR 166/16 und 2 BvR 1683/17 – vom 20.6.2023 (BGBl. 20 | `missing-predecessor-text` |
| `BayUeDPO` | 2 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2025-08-01, die jüngste Änderung GVBl. 2026 S. 520 tritt am 2026-08-01 in Kraft | `missing-predecessor-text` |
| `BayVerswG` | 2 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2024-01-01, die jüngste Änderung GVBl. 2026 S. 75 tritt am 2026-04-01 in Kraft | `missing-predecessor-text` |
| `BayVwV102340` | 2 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2024-08-01, die jüngste Änderung BayMBl. 2026 Nr. 29 tritt am 2026-02-01 in Kraft | `missing-predecessor-text` |
| `BayZALBV` | 2 | `contradictory/chain-history-mismatch` | Änderungsverlauf führt GVBl. 2025 S. 298 nicht | `missing-predecessor-text` |
| `BayZustVAMUeB` | 2 | `contradictory/portal-in-force-lag` | Der heutige Text gilt laut Paket seit 2024-07-01; GVBl. 2025 S. 246 (Art. 12a) (in Kraft 2025-08-01) ist darin noch nicht eingearbeitet – die nächstältere Änderung GVBl. 2024 S. 98 trat genau an diese |  |
| `Bay_ZuVLFG` | 2 | `contradictory/chain-prior-history-mismatch` | Die letzte Änderung vor der Kette (GVBl. 2024 S. 641) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („–“) | `missing-predecessor-text` |
| `ITPRStV` | 2 | `contradictory/chain-last-amendment` | Vollzitat nennt keine lesbare letzte Änderung („Staatsvertrag vom 20. November 2023 bis 31. Dezember 2023 (GVBl. 2024 S. 66, 642)“) |  |
| `BayHiMiBekmJD` | 3 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2025-09-01, die jüngste Änderung BayMBl. 2025 Nr. 444 tritt am 2025-11-01 in Kraft | `missing-predecessor-text` |
| `BayStaatsRRVG` | 3 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2024-12-17, die jüngste Änderung GVBl. 2025 S. 102 tritt am 2025-05-01 in Kraft | `missing-predecessor-text` |
| `BayUniKlinG` | 3 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-01-01, die jüngste Änderung GVBl. 2026 S. 75 tritt am 2026-04-01 in Kraft | `missing-predecessor-text` |
| `BayZAPOgtF_hF` | 3 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2024-07-01, die jüngste Änderung GVBl. 2024 S. 590 tritt am 2025-01-01 in Kraft | `missing-predecessor-text` |
| `BayZulV` | 3 | `contradictory/chain-prior-history-mismatch` | Die letzte Änderung vor der Kette (GVBl. 2024 S. 646) ist nicht der letzte Eintrag vor dem Stichtag im Änderungsverlauf („13. V zur Änderung der Bayerischen Zulagenverordnung vom 5.9.2023 (GVBl. S. 56 | `annex-replacement`, `missing-predecessor-text` |
| `BayGesV` | 4 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-01-01, die jüngste Änderung GVBl. 2026 S. 301 tritt am 2026-06-16 in Kraft |  |
| `BayKAG` | 4 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2024-12-17, die jüngste Änderung GVBl. 2025 S. 642 tritt am 2026-01-01 in Kraft | `missing-predecessor-text` |
| `BayPfleVG` | 4 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2025-06-01, die jüngste Änderung GVBl. 2026 S. 75 tritt am 2026-04-01 in Kraft | `missing-predecessor-text` |
| `BayAVSchFG` | 6 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-01-01, die jüngste Änderung GVBl. 2026 S. 425 tritt am 2026-08-01 in Kraft | `missing-predecessor-text` |
| `BayBG` | 6 | `contradictory/portal-in-force-mismatch` | Der heutige Text gilt laut Paket seit 2026-01-01, die jüngste Änderung GVBl. 2026 S. 75 tritt am 2026-04-01 in Kraft | `missing-predecessor-text` |

