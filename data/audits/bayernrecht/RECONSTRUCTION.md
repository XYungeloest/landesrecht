# Rückrechnung von Änderungen – BayWü

Stichtag **2023-12-01** · Auswertungsstichtag 2026-09-18 · erzeugt von `npm run import:bayernrecht:reconstruction-queue -- --write` (offline, nur Cache). Methode und Begründungen: `docs/BAYWUE_RECONSTRUCTION.md`. Schlange: `data/imports/bayernrecht/reconstruction-queue.json`. Rezepte: `data/imports/bayernrecht/reconstruction/<documentId>.json`.

## Kennzahl

Von **519** Normen der Klasse `changed-after-baseline` sind **13 sicher zurückgerechnet** (Methode `reverse-amendment`, Status `active-at-baseline` ohne Blocker). Die übrigen **506** bleiben `reconstruction-required` – mit einem Zustand der Rekonstruktionsschlange und Begründung.

Angegangen wurden nur die **239** Normen mit genau einem stark belegten Änderungsschritt nach dem Stichtag (stark aufgelöstes Ereignis des Registers mit Verkündung nach dem Stichtag – dieselbe Regel wie die Stichtagsklassifikation). Der Auftrag nannte 258; mit dieser Regel sind es 239. 13 davon sind zurückgerechnet.

**2** weitere Einschrittkandidaten bestehen Befehl, Inkrafttreten, Kette und den exakten Rundlauf – und bleiben trotzdem draußen, weil der **Beginn der Stichtagsfassung** nicht belegt ist. Entweder fehlt die Verkündung der vorangehenden Änderung (verkündet ist nicht in Kraft; ihr Inkrafttreten belegt nur ihre eigene Verkündung mit Kalenderdatum), oder die Norm begrenzt ihre eigene Geltung. Sie sind die ersten Kandidaten, sobald ein solcher Beleg vorliegt.

## Wo die Einschrittkandidaten scheitern

Jede Prüfung nur für Kandidaten, die die vorherigen erreicht haben; „nicht erreicht“ heißt, eine frühere Prüfung hat die Norm bereits ausgeschlossen.

| Prüfung | bestanden | nicht bestanden | nicht erreicht |
| --- | ---: | ---: | ---: |
| Detailseite und heutiges Paket im Cache | 239 | 0 | 0 |
| Einleitungssatz genau einmal, Befehlsblock und Orte lesbar | 203 | 36 | 0 |
| jede Klausel mit unterstützter, rückrechenbarer Formel | 22 | 197 | 20 |
| Inkrafttreten bestimmt, nach dem Stichtag, = inkraft des Pakets | 205 | 14 | 20 |
| einschrittig: Vollzitat, Änderungsverlauf, Fortführungsnachweis, übrige Verkündungen | 208 | 11 | 20 |
| Orte aufgelöst, Wortlaut je Bereich genau einmal, Rundlauf exakt | 15 | 4 | 220 |
| Beginn der Stichtagsfassung (≤ Stichtag) belegt | 13 | 108 | 118 |

## Zustände

| Zustand | alle 519 | davon einschrittig | Bedeutung |
| --- | ---: | ---: | --- |
| `partial-chain` | 277 | 25 | Kette nicht einschrittig |
| `non-invertible-amendment` | 138 | 137 | Befehl nicht umkehrbar |
| `command-unreadable` | 32 | 32 | Befehl nicht auffindbar oder nicht lesbar |
| `missing-base` | 27 | 0 | Beleg fehlt |
| `asset-missing` | 16 | 16 | Anlage ohne Alttext |
| `recipe-ready` | 13 | 13 | sicher zurückgerechnet (Rezept, Rundlauf exakt) |
| `unsupported-formula` | 13 | 13 | Formel nicht maschinell angewandt |
| `ambiguous-target` | 2 | 2 | Ort oder Wortlaut nicht eindeutig |
| `contradictory` | 1 | 1 | Belege widersprechen einander |

## Gründe

Je Norm zählt der schwerste Grund (Rangfolge: Beleg fehlt → Befehl unlesbar → Anlage → nicht umkehrbar → Kette → Widerspruch → Inkrafttreten → Formel → Mehrdeutigkeit → Rundlauf). Weitere gescheiterte Prüfungen stehen in der Schlange unter `alsoFailed`.

| Zustand / Grund | Normen |
| --- | ---: |
| `partial-chain/multi-step` | 252 |
| `non-invertible-amendment/recast` | 76 |
| `non-invertible-amendment/repeal-unit` | 34 |
| `missing-base/no-post-baseline-event` | 27 |
| `non-invertible-amendment/delete-words` | 27 |
| `partial-chain/prior-amendment-in-force-unproven` | 20 |
| `asset-missing/annex-recast` | 16 |
| `command-unreadable/location-unreadable` | 16 |
| `recipe-ready/reverse-amendment-verified` | 13 |
| `command-unreadable/intro-not-found` | 9 |
| `unsupported-formula/insert-unit` | 8 |
| `command-unreadable/structure-unreadable` | 7 |
| `partial-chain/multiple-sections` | 4 |
| `unsupported-formula/unrecognized` | 3 |
| `ambiguous-target/location-unresolved` | 1 |
| `ambiguous-target/reverse-target-ambiguous` | 1 |
| `contradictory/effective-after-evaluation` | 1 |
| `non-invertible-amendment/recast-event` | 1 |
| `partial-chain/baseline-text-in-force-unproven` | 1 |
| `unsupported-formula/container` | 1 |
| `unsupported-formula/renumber` | 1 |

## Änderungsformeln

Erhoben aus den Befehlsblöcken der Einschrittkandidaten, deren Einleitungssatz sich in der Verkündung fand. „Klauseln“ zählt jede Formel je Befehl; eine Norm fällt, sobald **eine** ihrer Klauseln nicht unterstützt ist.

| Formel | Wortlaut (Beispiel) | Klauseln | Normen | bestimmt Alttext | angewandt |
| --- | --- | ---: | ---: | :---: | :---: |
| `replace-words` | „… wird die Angabe „X“ durch die Angabe „Y“ ersetzt“ | 832 | 144 | ja | ja |
| `recast` | „… wird wie folgt gefasst:“ / „erhält folgende Fassung“ | 418 | 129 | nein | nein |
| `renumber` | „Der bisherige Abs. 2 wird Abs. 3“ / „Der Wortlaut wird Satz 1“ | 378 | 111 | (ja) | nein |
| `insert-unit` | „Folgender Abs. 3 wird angefügt: …“ / „Nach Nr. 4 wird folgende Nr. 5 eingefügt: …“ | 332 | 118 | (ja) | nein |
| `repeal-unit` | „… wird aufgehoben“ / „Satz 5 wird gestrichen“ | 210 | 100 | nein | nein |
| `insert-words` | „… wird nach/vor der Angabe „X“ die Angabe „Y“ eingefügt“ | 187 | 72 | ja | ja |
| `unrecognized` | nicht erkannt | 187 | 65 | (ja) | nein |
| `delete-words` | „… wird die Angabe „X“ gestrichen“ (ohne Anker) | 156 | 67 | nein | nein |
| `annex-recast` | „… erhalten die aus dem Anhang ersichtliche Fassung“ | 20 | 19 | nein | nein |
| `replace-final-punctuation` | „… wird der Punkt am Ende durch … ersetzt“ | 18 | 14 | ja | ja |
| `append-words` | „Der Überschrift wird die Angabe „Y“ angefügt“ | 15 | 12 | ja | ja |
| `replace-by-punctuation` | „… das Wort „oder“ durch ein Komma ersetzt“ | 7 | 3 | (ja) | nein |
| `delete-words-anchored` | „… wird nach/vor der Angabe „X“ die Angabe „Y“ gestrichen“ | 4 | 4 | ja | ja |
| `container` | „Art. 5 wird wie folgt geändert:“ (Gliederung) | 2 | 2 | (ja) | nein |

„(ja)“: bestimmt den Alttext grundsätzlich, wird aber nicht maschinell angewandt (strukturelle Änderung, Satzzeichen ohne eindeutige Stelle, nicht erkannte Formel).

## Zurückgerechnete Normen

| Norm | Verkündung | in Kraft | Beginn Stichtagsfassung | Schritte | Formeln | Stichtagskörper |
| --- | --- | --- | --- | ---: | --- | --- |
| `BayAltersGewV` | GVBl. 2024 S. 98 | 2024-07-01 | 2019-11-01 | 1 | replace-words | `7acb6cd43bc5de64` |
| `BayBauVorlV2008` | GVBl. 2024 S. 619 | 2025-01-01 | 2021-02-01 | 1 | replace-words | `63f9ad0ea9132b58` |
| `BayBestG` | GVBl. 2024 S. 98 | 2024-07-01 | 2016-09-01 | 4 | replace-words | `4a6494cc2e4d655b` |
| `BayDVSoSchG_2` | GVBl. 2026 S. 425 | 2026-08-01 | 2018-01-01 | 1 | replace-words | `982fbcc055684196` |
| `BayFoRG` | GVBl. 2024 S. 98 | 2024-07-01 | 2019-05-01 | 3 | replace-words | `2a8a3403b0d8a312` |
| `BayHG2019_2020` | GVBl. 2024 S. 114 | 2024-01-01 | 2020-01-01 | 1 | replace-words | `c77321a4dbe8d1ac` |
| `BayKRegG` | GVBl. 2024 S. 98 | 2024-07-01 | 2023-08-01 | 1 | replace-words | `abf0de6d9437bcc1` |
| `BayUStuetzV` | GVBl. 2025 S. 605 | 2025-12-31 | 2020-12-31 | 4 | replace-words | `905af085dc11b24d` |
| `BayVV_2175_4_G_14041` | BayMBl. 2024 Nr. 279 | 2024-06-27 | 2023-10-05 | 2 | replace-words | `dbc6d22e1d480e4a` |
| `BayVV_330_A_571` | BayMBl. 2026 Nr. 225 | 2026-07-01 | 2018-12-01 | 1 | replace-words | `b9247afa1721a7c6` |
| `BayVfV` | GVBl. 2024 S. 98 | 2024-07-01 | 2019-11-01 | 1 | replace-words | `6b4046b1cad8c0fc` |
| `BayZAPOhGesD` | GVBl. 2024 S. 98 | 2024-07-01 | 2021-01-01 | 1 | replace-words | `40ae9b65bb4eb63b` |
| `BayZuVSchfw` | GVBl. 2025 S. 149 | 2025-06-01 | 2018-11-01 | 1 | replace-words | `67396d66ca0d65af` |

### BayAltersGewV

- Änderung: GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2019-11-01 – Vorangehende Änderung vom 1. Oktober 2019 (GVBl. S. 594) (§ 2): „Diese Verordnung tritt am 1. November 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-594/, SHA-256 e5a91a05dea859d8…
- s01 `replace-words` in § 1 Nr. 4 Satzteil vor ersten Spiegelstrich: „In § 1 Nr. 4 Satzteil vor dem ersten Spiegelstrich werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
  - Stichtag: „…Bereich des Staatsministeriums für Ernährung, Landwirtschaft und Forsten“
  - heute: „…Bereich des Staatsministeriums für Ernährung, Landwirtschaft, Forsten und Tourismus“

### BayBauVorlV2008

- Änderung: GVBl. 2024 S. 619 (https://www.verkuendung-bayern.de/gvbl/2024-619/, SHA-256 `3a65bd64362d3f43…`), verkündet 2024-12-30, in Kraft 2025-01-01 („Dieses Gesetz tritt am 1. Januar 2025 in Kraft.“)
- Beginn der Stichtagsfassung: 2021-02-01 – Vorangehende Änderung vom 23. Dezember 2020 (GVBl. S. 663) (§ 5): „Dieses Gesetz tritt am 1. Februar 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-663/, SHA-256 f9384e24b4b0e925…
- s01 `replace-words` in § 2 Satz 2 Halbsatz 1: „In § 2 Satz 2 Halbsatz 1 wird die Angabe „Art. 65 Abs. 1“ durch die Angabe „Art. 65 Abs. 2“ ersetzt.“
  - Stichtag: „…gen verlangen, soweit dies zur Beteiligung von Stellen nach Art. 65 Abs. 1 Satz 1 Halbsatz 1 BayBO (Sternverfahren) erfo…“
  - heute: „…gen verlangen, soweit dies zur Beteiligung von Stellen nach Art. 65 Abs. 2 Satz 1 Halbsatz 1 BayBO (Sternverfahren) erfo…“

### BayBestG

- Änderung: GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2016-09-01 – Vorangehende Änderung vom 2. August 2016 (GVBl. S. 246) (§ 1): „Dieses Gesetz tritt am 1. September 2016 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2016-246/, SHA-256 aa197ad27cf93652…
- s01 `replace-words` in Art. 3a Abs. 4 Satz 1 Halbsatz 2: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
  - Stichtag: „…erungsbezirke, bestimmt das Staatsministerium für Gesundheit und Pflege die zuständige Regierung. ²In den Fällen des Abs…“
  - heute: „…erungsbezirke, bestimmt das Staatsministerium für Gesundheit, Pflege und Prävention die zuständige Regierung. ²In den Fällen des Abs…“
- s02 `replace-words` in Art. 15 Abs. 1: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
  - Stichtag: „Das Staatsministerium für Gesundheit und Pflege wird ermächtigt, durch Rechtsverordnung zu besti…“
  - heute: „Das Staatsministerium für Gesundheit, Pflege und Prävention wird ermächtigt, durch Rechtsverordnung zu besti…“
- s03 `replace-words` in Art. 16 Satzteil vor Nr. 1: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
  - Stichtag: „Das Staatsministerium für Gesundheit und Pflege wird ermächtigt, durch Rechtsverordnungen“
  - heute: „Das Staatsministerium für Gesundheit, Pflege und Prävention wird ermächtigt, durch Rechtsverordnungen“
- s04 `replace-words` in Art. 16 Nr. 1 Satz 2 Satzteil vor Buchst. a: „In Art. 3a Abs. 4 Satz 1 Halbsatz 2, Art. 15 Abs. 1 und Art. 16 Satzteil vor Nr. 1 und Nr. 1 Satz 2 Satzteil vor Buchst. a werden jeweils die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
  - Stichtag: „…Rechtsverordnungen kann das Staatsministerium für Gesundheit und Pflege insbesondere“
  - heute: „…Rechtsverordnungen kann das Staatsministerium für Gesundheit, Pflege und Prävention insbesondere“

### BayDVSoSchG_2

- Änderung: GVBl. 2026 S. 425 (https://www.verkuendung-bayern.de/gvbl/2026-425/, SHA-256 `e6ba532d1b2747b4…`), verkündet 2026-07-30, in Kraft 2026-08-01 („Diese Verordnung tritt am 1. August 2026 in Kraft.“)
- Beginn der Stichtagsfassung: 2018-01-01 – Vorangehende Änderung vom 26. Februar 2018 (GVBl. S. 188): „Diese Verordnung tritt mit Wirkung vom 1. Januar 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-188/, SHA-256 678d88116b2964ba…
- s01 `replace-words` in § 5 Abs. 3: „In § 5 Abs. 3 wird die Angabe „§ 92 Abs. 2 Satz 1 bis 3“ durch die Angabe „§ 142 Abs. 1 und 3 des Neunten Buches Sozialgesetzbuch (SGB IX)“ ersetzt.“
  - Stichtag: „…ie Befugnisse betreffend die Verpflichtungen Anderer gelten § 92 Abs. 2 Satz 1 bis 3 und die §§ 93 bis 95 SGB XII entspr…“
  - heute: „…ie Befugnisse betreffend die Verpflichtungen Anderer gelten § 142 Abs. 1 und 3 des Neunten Buches Sozialgesetzbuch (SGB IX) und die §§ 93 bis 95 SGB XII entspr…“

### BayFoRG

- Änderung: GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2019-05-01 – Vorangehende Änderung vom 26. März 2019 (GVBl. S. 98) (§ 1): „Diese Verordnung tritt am 1. Mai 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-98/, SHA-256 cd4c0ab7a010a4f6…
- s01 `replace-words` in Art. 7 Abs. 3: „In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
  - Stichtag: „Das Staatsministerium für Ernährung, Landwirtschaft und Forsten erläßt im Einvernehmen mit den Staatsministerie…“
  - heute: „Das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus erläßt im Einvernehmen mit den Staatsministerie…“
- s02 `replace-words` in Art. 29 Abs. 3 Satz 1: „In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
  - Stichtag: „…t Bayern vom Staatsministerium für Ernährung, Landwirtschaft und Forsten, im übrigen von der einschlägigen Organisation …“
  - heute: „…t Bayern vom Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus, im übrigen von der einschlägigen Organisation …“
- s03 `replace-words` in Art. 51: „In Art. 7 Abs. 3, Art. 29 Abs. 3 Satz 1 und Art. 51 werden jeweils die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
  - Stichtag: „Das Staatsministerium für Ernährung, Landwirtschaft und Forsten erläßt im Einvernehmen mit den Staatsministerie…“
  - heute: „Das Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus erläßt im Einvernehmen mit den Staatsministerie…“

### BayHG2019_2020

- Änderung: GVBl. 2024 S. 114 (https://www.verkuendung-bayern.de/gvbl/2024-114/, SHA-256 `c13f316994452091…`), verkündet 2024-06-28, in Kraft 2024-01-01 („Dieses Gesetz tritt mit Wirkung vom 1. Januar 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2020-01-01 – Vorangehende Änderung vom 27. April 2020 (GVBl. S. 238) (§ 1): „Dieses Gesetz tritt mit Wirkung vom 1. Januar 2020 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-238/, SHA-256 3a02863da5e3f2ea…
- s01 `replace-words` in Art. 18 Abs. 5: „In Art. 18 Abs. 5 wird die Angabe „31. Dezember 2043“ durch die Angabe „31. Dezember 2023“ ersetzt.“
  - Stichtag: „Art. 2a Abs. 2 tritt mit Ablauf des 31. Dezember 2043 außer Kraft.“
  - heute: „Art. 2a Abs. 2 tritt mit Ablauf des 31. Dezember 2023 außer Kraft.“

### BayKRegG

- Änderung: GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2023-08-01 – Vorangehende Änderung vom 24. Juli 2023 (GVBl. S. 430): „Dieses Gesetz tritt am 1. August 2023 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2023-430/, SHA-256 912b1084230359e2…
- s01 `replace-words` in Art. 13 Abs. 2 Satz 1: „In Art. 13 Abs. 2 Satz 1 werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
  - Stichtag: „…en ist eine Zustimmung des Staatsministeriums für Gesundheit und Pflege (Staatsministerium) erforderlich. ²Das Staatsmin…“
  - heute: „…en ist eine Zustimmung des Staatsministeriums für Gesundheit, Pflege und Prävention (Staatsministerium) erforderlich. ²Das Staatsmin…“

### BayUStuetzV

- Änderung: GVBl. 2025 S. 605 (https://www.verkuendung-bayern.de/gvbl/2025-605/, SHA-256 `02e55601dde7f6dc…`), verkündet 2025-12-15, in Kraft 2025-12-31 („Diese Verordnung tritt am 31. Dezember 2025 in Kraft.“)
- Beginn der Stichtagsfassung: 2020-12-31 – Vorangehende Änderung vom 16. Dezember 2020 (GVBl. S. 709): „Diese Verordnung tritt am 31. Dezember 2020 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-709/, SHA-256 f6e382d7415cb55d…
- s01 `replace-words` in § 1 Abs. 1: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
  - Stichtag: „…auf je fünf Millionen Euro pro Jahr, für die Jahre 2021 bis 2025 auf je eine Million Euro pro Jahr festgesetzt.“
  - heute: „…auf je fünf Millionen Euro pro Jahr, für die Jahre 2021 bis 2030 auf je eine Million Euro pro Jahr festgesetzt.“
- s02 `replace-words` in § 1 Abs. 3 Satz 8: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
  - Stichtag: „…r Antrag auf Beitragsreduzierung kann nur bis zum 1. Januar 2025 gestellt werden.“
  - heute: „…r Antrag auf Beitragsreduzierung kann nur bis zum 1. Januar 2030 gestellt werden.“
- s03 `replace-words` in § 3 Abs. 3 Satz 1: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
  - Stichtag: „…ses aus dem Unterstützungsfonds, frühestens am 31. Dezember 2025. ²Das Staatsministerium für Umwelt und Verbraucherschut…“
  - heute: „…ses aus dem Unterstützungsfonds, frühestens am 31. Dezember 2030. ²Das Staatsministerium für Umwelt und Verbraucherschut…“
- s04 `replace-words` in § 5 Satz 2: „In § 1 Abs. 1, 3 Satz 8, § 3 Abs. 3 Satz 1 und § 5 Satz 2 wird die Angabe „2025“ jeweils durch die Angabe „2030“ ersetzt.“
  - Stichtag: „…n Kraft. ²Die §§ 1 und 2 treten mit Ablauf des 31. Dezember 2025 außer Kraft.“
  - heute: „…n Kraft. ²Die §§ 1 und 2 treten mit Ablauf des 31. Dezember 2030 außer Kraft.“

### BayVV_2175_4_G_14041

- Änderung: BayMBl. 2024 Nr. 279 (https://www.verkuendung-bayern.de/baymbl/2024-279/, SHA-256 `21737ba66968ee0f…`), verkündet 2024-06-19, in Kraft 2024-06-27 („Diese Bekanntmachung tritt am 27. Juni 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2023-10-05 – Inkrafttretensvorschrift im Stichtagstext, 10. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt am 5. Oktober 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft.“ · Außerkrafttreten der Norm erst 2026-12-31, nach dem Stichtag: „Diese Bekanntmachung tritt am 5. Oktober 2023 in Kraft und mit Ablauf des 31. Dezember 2026 außer Kraft“
- s01 `replace-words` in Nr. 6.6 Satz 2: „In Nr. 6.6 Satz 2 werden die Angabe „360/2012“ durch die Angabe „2023/2832“ und die Angabe „1407/2013“ durch die Angabe „2023/2831“ ersetzt.“
  - Stichtag: „…diesem Fall, ob die Voraussetzungen der Verordnung (EU) Nr. 360/2012 (DAWI-De-minimis-Verordnung), des Beschlusses 2012/…“
  - heute: „…diesem Fall, ob die Voraussetzungen der Verordnung (EU) Nr. 2023/2832 (DAWI-De-minimis-Verordnung), des Beschlusses 2012/…“
- s02 `replace-words` in Nr. 6.6 Satz 2: „In Nr. 6.6 Satz 2 werden die Angabe „360/2012“ durch die Angabe „2023/2832“ und die Angabe „1407/2013“ durch die Angabe „2023/2831“ ersetzt.“
  - Stichtag: „… (DAWI-Freistellungsbeschluss) oder der Verordnung (EU) Nr. 1407/2013 (De-minimis-Verordnung) vorliegen. ³Sofern eine DA…“
  - heute: „… (DAWI-Freistellungsbeschluss) oder der Verordnung (EU) Nr. 2023/2831 (De-minimis-Verordnung) vorliegen. ³Sofern eine DA…“

### BayVV_330_A_571

- Änderung: BayMBl. 2026 Nr. 225 (https://www.verkuendung-bayern.de/baymbl/2026-225/, SHA-256 `84f9d61db098ecef…`), verkündet 2026-06-03, in Kraft 2026-07-01 („Diese Bekanntmachung tritt am 1. Juli 2026 in Kraft.“)
- Beginn der Stichtagsfassung: 2018-12-01 – Inkrafttretensvorschrift im Stichtagstext, 2. Inkrafttreten, Außerkrafttreten: „Diese Bekanntmachung tritt am 1. Dezember 2018 in Kraft.“
- s01 `replace-words` in Nr. 1.1: „In Nr. 1.1 wird die Angabe „7“ durch die Angabe „10“ ersetzt.“
  - Stichtag: „7“
  - heute: „10“

### BayVfV

- Änderung: GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2019-11-01 – Vorangehende Änderung vom 1. Oktober 2019 (GVBl. S. 594) (§ 6): „Diese Verordnung tritt am 1. November 2019 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2019-594/, SHA-256 e5a91a05dea859d8…
- s01 `replace-words` in § 4 Abs. 3: „In § 4 Abs. 3 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.“
  - Stichtag: „…, der Finanzen und für Heimat, für Ernährung, Landwirtschaft und Forsten und für Familie, Arbeit und Soziales sowie alle…“
  - heute: „…, der Finanzen und für Heimat, für Ernährung, Landwirtschaft, Forsten und Tourismus und für Familie, Arbeit und Soziales sowie alle…“

### BayZAPOhGesD

- Änderung: GVBl. 2024 S. 98 (https://www.verkuendung-bayern.de/gvbl/2024-98/, SHA-256 `39a30d715faa4cf3…`), verkündet 2024-06-14, in Kraft 2024-07-01 („Diese Verordnung tritt am 1. Juli 2024 in Kraft.“)
- Beginn der Stichtagsfassung: 2021-01-01 – Vorangehende Änderung vom 17. November 2020 (GVBl. S. 647): „Diese Verordnung tritt am 1. Januar 2021 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2020-647/, SHA-256 1988afef16eed976…
- s01 `replace-words` in § 2 Abs. 2: „In § 2 Abs. 2 werden die Wörter „und Pflege“ durch die Wörter „ , Pflege und Prävention“ ersetzt.“
  - Stichtag: „Das Staatsministerium für Gesundheit und Pflege (Staatsministerium) kann in Einzelfällen im Inte…“
  - heute: „Das Staatsministerium für Gesundheit, Pflege und Prävention (Staatsministerium) kann in Einzelfällen im Inte…“

### BayZuVSchfw

- Änderung: GVBl. 2025 S. 149 (https://www.verkuendung-bayern.de/gvbl/2025-149/, SHA-256 `9e6fb6bf79425b81…`), verkündet 2025-05-30, in Kraft 2025-06-01 („Diese Verordnung tritt am 1. Juni 2025 in Kraft.“)
- Beginn der Stichtagsfassung: 2018-11-01 – Vorangehende Änderung vom 2. Oktober 2018 (GVBl. S. 786): „Diese Verordnung tritt am 1. November 2018 in Kraft.“ – https://www.verkuendung-bayern.de/gvbl/2018-786/, SHA-256 35b659daf2cfcb9a…
- s01 `replace-words` in § 1 Abs. 2: „In § 1 Abs. 2 wird die Angabe „§§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 2 Halbsatz 1 und Abs. 3 sowie § 12 Abs. 1 und 2 SchfHwG“ durch die Angabe „§§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 1, Abs. 2 Halbsatz 1 und Abs. 3, § 11b Abs. 1 bis 3 sowie § 12 Abs. 1 und 2 SchfHwG“ ersetzt.“
  - Stichtag: „Zuständige Behörden gemäß den §§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 2 Halbsatz …“
  - heute: „Zuständige Behörden gemäß den §§ 7, 8 Abs. 1, §§ 9, 9a Abs. 2 und 3, § 10 Abs. 1, Abs. 2 Halbsatz 1 und Abs. 3, § 11b …“

## Rundlauf bestanden, Beginn der Stichtagsfassung nicht belegt

| Norm | Verkündung | in Kraft | vorangehende Änderung laut Befehl | Grund |
| --- | --- | --- | --- | --- |
| `BayBedV` | GVBl. 2025 S. 246 | 2025-08-01 | § 2 des Gesetzes vom 9. Mai 2006 (GVBl. S. 190) | `prior-amendment-in-force-unproven` |
| `BayHG2021` | GVBl. 2024 S. 114 | 2024-01-01 | – (Stammfassung) | `baseline-text-in-force-unproven` |

## Einschrittige Kandidaten, die nicht zurückgerechnet wurden

| Norm | Zustand | Grund | Befund |
| --- | --- | --- | --- |
| `BayAPO` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 19. September 2023 (GVBl. S. 570)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung  |
| `BayAufbewV` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 30. Mai 2017 (GVBl. S. 283)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen  |
| `BayBedV` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 9. Mai 2006 (GVBl. S. 190)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen ( |
| `BayBodenschEntschV` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 6. März 2013 (GVBl. S. 164)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen  |
| `BayDVVwZVG` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 5. Juni 2018 (GVBl. S. 397)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen  |
| `BayEBekMiZi` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 22. September 2023 (BayMBl. Nr. 472)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassu |
| `BayEStBAPO` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 27. Oktober 2023 (GVBl. S. 608)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung of |
| `BayHG2021` | `partial-chain` | `baseline-text-in-force-unproven` | Beginn der Stichtagsfassung (Stammfassung) nicht belegt: Die Norm begrenzt ihre eigene Geltung („gelten bis zum Tag der Bekanntmachung des Haushaltsgesetzes des folgenden Haushaltsjahres weiter“); ob sie am Stichtag galt |
| `BayILSG` | `partial-chain` | `multiple-sections` | 2 Zitate der Norm mit Änderungsbefehl (Einheiten 5, 104); mehrere Änderungsabschnitte in einer Verkündung werden nicht zusammengeführt |
| `BayJAVollzG` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 21. Oktober 2022 (GVBl. S. 642)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung of |
| `BayKWBG` | `partial-chain` | `multiple-sections` | 2 Zitate der Norm mit Änderungsbefehl (Einheiten 1626, 1633); mehrere Änderungsabschnitte in einer Verkündung werden nicht zusammengeführt |
| `BayLandesBG` | `partial-chain` | `multiple-sections` | 2 Zitate der Norm mit Änderungsbefehl (Einheiten 18, 40); mehrere Änderungsabschnitte in einer Verkündung werden nicht zusammengeführt |
| `BayNatWaldV` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 23. Juni 2022 (GVBl. S. 277)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen |
| `BayNotarV` | `partial-chain` | `multiple-sections` | 2 Zitate der Norm mit Änderungsbefehl (Einheiten 8, 75); mehrere Änderungsabschnitte in einer Verkündung werden nicht zusammengeführt |
| `BayRKG` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 7. Juli 2023 (GVBl. S. 313)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen  |
| `BayRMRatV` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 15. Juni 2021 (GVBl. S. 353)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen |
| `BaySchBQuVO` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 31. Oktober 2018 (GVBl. S. 816)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung of |
| `BaySpielbG` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 22. April 2022 (GVBl. S. 147)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offe |
| `BayVHBSt` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 15. Juni 2018 (GVBl. S. 515)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offen |
| `BayVV_2230_7_UK_459` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 2. Februar 2022 (BayMBl. Nr. 105)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung  |
| `BayVV_301_I_2284` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 12. Dezember 2022 (BayMBl. Nr. 755)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassun |
| `BayVwV101445` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 12. November 2020 (BayMBl. Nr. 678, Nr. 806)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Sticht |
| `BayVwV270888` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 6. Juni 2018 (AllMBl. S. 419)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung offe |
| `BayVwV274719` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 22. Juni 2023 (BayMBl. Nr. 321)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stichtagsfassung of |
| `BayVwV319722` | `partial-chain` | `prior-amendment-in-force-unproven` | Die vorangehende Änderung (vom 30. September 2022 (BayMBl. Nr. 585, Nr. 694)) ist vor dem Stichtag verkündet, ihr Inkrafttreten vor dem Stichtag aber aus dem Cache nicht belegt; ohne diesen Beleg ist der Beginn der Stich |
| `BayAVWaffBeschR` | `unsupported-formula` | `renumber` | 1. „Der Wortlaut wird Abs. 1.“: Umnummerierung: strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayArchivGl` | `unsupported-formula` | `insert-unit` | 2. „In § 1 wird folgende Überschrift eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayBFSOMusik` | `unsupported-formula` | `unrecognized` | „wird wie folgt geändert.“: Befehlsrest ohne Schlussverb: „wird wie folgt geändert“ |
| `BayFachVUVAD` | `unsupported-formula` | `insert-unit` | 2. „Nach § 3 wird folgender Teil 3 eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayKommHVDoppik` | `unsupported-formula` | `insert-unit` | 2. „Dem § 99 wird folgender Abs. 5 angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVV_2232_2_K_11648` | `unsupported-formula` | `unrecognized` | 1.1 „In Anlage 5 wird in der Kopfzeile die Angabe „Jahrgangsstufen 3 und 4“ durch die Angabe „Jahrgangsstufe 3“ ersetzt.“: Klausel nicht erkannt: „wird in der Kopfzeile die Angabe ⟦0⟧ durch die Angabe ⟦1⟧ ersetzt“ |
| `BayVV_2235_1_1_5_K_13224` | `unsupported-formula` | `insert-unit` | 1.1 „Nach Nr. 2 wird folgende Nr. 3 eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayVV_2244_F_12366` | `unsupported-formula` | `unrecognized` | 4. „In Nr. 2.3.5 wird das Wort „Maßnahmen“ durch das Wort „Vorhaben“ ersetzt“.“: Befehlsrest ohne Schlussverb: „““ |
| `BayVV_2244_F_13364` | `unsupported-formula` | `container` | 2. „Nr. 2.2 wird wie folgt geändert:“: Gliederungsbefehl ohne eigene Änderung |
| `BayVV_8113_1_A_11725` | `unsupported-formula` | `insert-unit` | 1.1 „Der Nr. 6 wird folgende Nr. 6.7 angefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayWoBindG` | `unsupported-formula` | `insert-unit` | 1. c) „Nach Abs. 1 wird folgender Abs. 2 eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayZGAusland` | `unsupported-formula` | `insert-unit` | 1. „Nach Art. 3 wird folgender Art. 4 eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayZweckVermG` | `unsupported-formula` | `insert-unit` | 1. a) „Folgende Überschrift wird eingefügt:“: Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt |
| `BayUntVergV` | `ambiguous-target` | `reverse-target-ambiguous` | s01: neuer Wortlaut „Anwärter“ kommt im Bereich 2-mal vor (erwartet: genau einmal) |
| `BayVV_320_A_570` | `ambiguous-target` | `location-unresolved` | 1.1 1.1.2 Nr. 1 Buchst. a: Buchst. a nicht gefunden |
| `BayAGZweigstV` | `command-unreadable` | `location-unreadable` | Ortsangabe „Anlage“ nicht lesbar (2.) |
| `BayAbfZustV` | `command-unreadable` | `structure-unreadable` | Einheit 33: Zitat ohne vorangehenden Befehl mit Doppelpunkt |
| `BayAbhGertArbV` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayDVLArztG` | `command-unreadable` | `structure-unreadable` | Einheit 17: Zitat ohne vorangehenden Befehl mit Doppelpunkt |
| `BayGebOVerm` | `command-unreadable` | `location-unreadable` | Ortsangabe „Satz 1 Satzteil vor der Tabelle“ nicht lesbar (5. a) aa)) |
| `BayVV_12_I_2272` | `command-unreadable` | `location-unreadable` | Ortsangabe „Einleitung“ nicht lesbar (1.2) |
| `BayVV_2025_I_11358` | `command-unreadable` | `location-unreadable` | Ortsangabe „Anlage“ nicht lesbar (1.3) |
| `BayVV_2030_13_I_2296` | `command-unreadable` | `location-unreadable` | Ortsangabe „Einleitung“ nicht lesbar (1.2) |
| `BayVV_2030_2_3_K_11961` | `command-unreadable` | `location-unreadable` | Ortsangabe „neue Nr. 9.3.3“ nicht lesbar (1.2 1.2.14) |
| `BayVV_2038_3_11_G_13478` | `command-unreadable` | `location-unreadable` | Ortsangabe „Vorbemerkung“ nicht lesbar (1.2) |
| `BayVV_2126_0_G_11762` | `command-unreadable` | `location-unreadable` | Ortsangabe „Einleitungsformel“ nicht lesbar (1.2) |
| `BayVV_2126_1_G_12555` | `command-unreadable` | `location-unreadable` | Ortsangabe „Einleitungsformel“ nicht lesbar (1.1) |
| `BayVV_2230_1_1_1_0_K_14216` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVV_2235_1_1_1_UK_231` | `command-unreadable` | `structure-unreadable` | Einheit 6: Zitat ohne vorangehenden Befehl mit Doppelpunkt |
| `BayVV_2272_UK_207` | `command-unreadable` | `location-unreadable` | Ortsangabe „Spiegelstrich 1 „Fahrtkosten““ nicht lesbar (1.10 1.10.1) |
| `BayVV_2272_UK_209` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVV_34_I_12346` | `command-unreadable` | `location-unreadable` | Ortsangabe „Einleitung“ nicht lesbar (1.2) |
| `BayVV_61_02_03_01_F_13270` | `command-unreadable` | `structure-unreadable` | Ein Zitat wird bis zum Ende der Seite nicht geschlossen |
| `BayVV_7801_L_10618` | `command-unreadable` | `location-unreadable` | Ortsangabe „Titel“ nicht lesbar (1.1) |
| `BayVV_7801_L_13600` | `command-unreadable` | `structure-unreadable` | Einheit 84: Gliederungssprung von Ebene 1 auf 3 |
| `BayVV_7803_1_L_10832` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVV_7803_2_L_10662` | `command-unreadable` | `location-unreadable` | Ortsangabe „neue Nr. 8.7“ nicht lesbar (1.10) |
| `BayVV_7803_2_L_10836` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVV_7846_L_13701` | `command-unreadable` | `location-unreadable` | Ortsangabe „Fußnote Nr. 3“ nicht lesbar (1.5 1.5.3) |
| `BayVV_787_L_13875` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVV_913_B_11939` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVwV151525` | `command-unreadable` | `structure-unreadable` | Ein Zitat wird bis zum Ende der Seite nicht geschlossen |
| `BayVwV154721` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayVwV159082` | `command-unreadable` | `location-unreadable` | Ortsangabe „Inhaltsübersicht“ nicht lesbar (1.1) |
| `BayVwV229918` | `command-unreadable` | `location-unreadable` | Ortsangabe „Präambel“ nicht lesbar (1.1) |
| `BayVwV252304` | `command-unreadable` | `structure-unreadable` | Ein Zitat wird bis zum Ende der Seite nicht geschlossen |
| `BayZustWaffVIM` | `command-unreadable` | `intro-not-found` | Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl |
| `BayAGBtG` | `non-invertible-amendment` | `repeal-unit` | 2. „Art. 5 Abs. 1 Satz 3 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayAGWVG` | `non-invertible-amendment` | `recast` | 1. b) „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayAVFwG` | `non-invertible-amendment` | `repeal-unit` | „werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayAbfAlG` | `non-invertible-amendment` | `delete-words` | 1. „In Art. 3 Abs. 6 wird die Angabe „nach dem Stand der Technik“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayAbgrG` | `non-invertible-amendment` | `recast` | „Art. 7 Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayAgrG` | `non-invertible-amendment` | `delete-words` | 1. „In Art. 1 werden die Wörter „und des Landpachtverkehrsgesetzes (LPachtVG)“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayArchivG` | `non-invertible-amendment` | `recast` | 1. „Art. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayAufbauG` | `non-invertible-amendment` | `delete-words` | 2. a) „In Abs. 1 wird die Angabe „(1)“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayAuswVAM` | `non-invertible-amendment` | `recast` | 2. a) „Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayBGG` | `non-invertible-amendment` | `recast` | „Art. 18 Abs. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayBekV` | `non-invertible-amendment` | `recast` | 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayBoFiV` | `non-invertible-amendment` | `recast` | 2. „In § 11 Abs. 2 Nr. 2 wird die Angabe „ . “ am Ende durch folgende Angabe ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext |
| `BayBodSchG` | `non-invertible-amendment` | `recast` | „Art. 15 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayBoersV` | `non-invertible-amendment` | `recast` | 3. a) „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayDVVersoG` | `non-invertible-amendment` | `delete-words` | 2. „In § 5 Abs. 2 Nr. 2 und § 9 Abs. 2 Satz 1 wird die Angabe „Abs. 1“ jeweils gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayEBV` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayEbFoeG` | `non-invertible-amendment` | `repeal-unit` | 1. b) „Nr. 5 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayErwSchLV` | `non-invertible-amendment` | `repeal-unit` | 1. a) bb) „Die Sätze 2 und 3 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayEzG2021` | `non-invertible-amendment` | `delete-words` | 1. „In der Überschrift wird die Angabe „für Verdienste im Ehrenamt und im Auslandseinsatz“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayFBV` | `non-invertible-amendment` | `recast` | 1. „§ 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayFPO_II` | `non-invertible-amendment` | `recast` | 1. a) „Abs. 1 Satz 2 Nr. 1 und 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayFachVSozVerw` | `non-invertible-amendment` | `recast` | 1. a) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayFamGG` | `non-invertible-amendment` | `repeal-unit` | 2. „Die Art. 2 bis 8 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayFlbQualiV` | `non-invertible-amendment` | `recast` | 2. „Abs. 4 Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayFoG` | `non-invertible-amendment` | `recast` | 1. b) „Abs. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayFoStS` | `non-invertible-amendment` | `recast` | 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayFwHOEzG` | `non-invertible-amendment` | `recast` | 1. a) „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayGSG` | `non-invertible-amendment` | `recast` | 1. a) aa) „Die Buchst. c und d werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayHZG` | `non-invertible-amendment` | `repeal-unit` | 1. „Abs. 4 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayHausuV` | `non-invertible-amendment` | `recast` | 1. b) aa) „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayHygV` | `non-invertible-amendment` | `recast` | 2. „§ 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayIVUAbwWPBV` | `non-invertible-amendment` | `repeal-unit` | 1. b) „Satz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayIntG` | `non-invertible-amendment` | `delete-words` | 1. a) „In Satz 1 werden die Wörter „(Art. 26 Abs. 1 Satz 5 des Bayerischen Kinderbildungs- und -betreuungsgesetzes – BayKiBiG)“ gestrichen und nach“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayKJG` | `non-invertible-amendment` | `repeal-unit` | 1. „Nr. 1 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayKUV` | `non-invertible-amendment` | `recast` | 2. „§ 22 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayKatSchutzG` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayKlimaG` | `non-invertible-amendment` | `repeal-unit` | „Art. 9 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayKommHV` | `non-invertible-amendment` | `recast` | 2. „§ 79 Abs. 2 Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayKommPrV` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayKrVerguetV` | `non-invertible-amendment` | `recast` | 1. a) „Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayKraSO` | `non-invertible-amendment` | `repeal-unit` | 5. c) bb) „Halbsatz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayLGLV` | `non-invertible-amendment` | `recast` | 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayLKrSitzV` | `non-invertible-amendment` | `recast` | „§ 2 Nr. 4 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayLPO_I` | `non-invertible-amendment` | `delete-words` | 2. „In § 3 Abs. 3 Satz 2 wird das Wort „Neugriechisch,“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayLRAuszG` | `non-invertible-amendment` | `delete-words` | 2. a) „In Abs. 1 wird die Angabe „(1)“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayLaborV` | `non-invertible-amendment` | `recast` | 1. a) „Die Nrn. 1 bis 5 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayLfFV` | `non-invertible-amendment` | `delete-words` | 1. a) aa) aaa) „Die Angabe „München,“ wird gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayMaxOG` | `non-invertible-amendment` | `delete-words` | 10. b) „In Abs. 1 wird die Angabe „(1)“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayMaxOStat` | `non-invertible-amendment` | `recast` | 2. b) „Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayMediend_StVAG` | `non-invertible-amendment` | `recast` | 2. „Art. 1 Abs. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayMfG2008` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayNatLandAkV` | `non-invertible-amendment` | `repeal-unit` | 1. b) „Satz 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayPolBilG` | `non-invertible-amendment` | `recast` | „Art. 1 Abs. 1 Satz 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayPrVProfV` | `non-invertible-amendment` | `recast` | 1. c) „Der Satzteil vor Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayPsychKHG` | `non-invertible-amendment` | `repeal-unit` | „Art. 4 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayRiStAG` | `non-invertible-amendment` | `repeal-unit` | 2. a) „Abs. 2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BaySchallzVO` | `non-invertible-amendment` | `recast` | 1. a) „Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BaySchiffSvEV` | `non-invertible-amendment` | `recast` | 1. a) aa) „Satz 1 Nr. 1 bis 5 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BaySozKiPaedG` | `non-invertible-amendment` | `recast` | 1. „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayStudAkkV` | `non-invertible-amendment` | `delete-words` | 3. a) aa) „In Satz 3 wird die Angabe „in der Regel“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayTNAV` | `non-invertible-amendment` | `recast` | 2. a) aa) aaa) „Nr. 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVPSW` | `non-invertible-amendment` | `repeal-unit` | 1. b) cc) „Buchst. c wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVSG` | `non-invertible-amendment` | `delete-words` | 1. „In Art. 10 Abs. 2 Satz 2 und 3 wird die Angabe „nach dem Stand der Technik“ jeweils gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVVPStG` | `non-invertible-amendment` | `recast` | 2. „§ 6 Abs. 2 Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_108268` | `non-invertible-amendment` | `recast` | „wird das Verzeichnis extremistischer oder extremistisch beeinflusster Organisationen wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_1102_F_10160` | `non-invertible-amendment` | `repeal-unit` | 1.1 1.1.2 „Buchst. b wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_1142_S_13045` | `non-invertible-amendment` | `recast` | 1.3 „Die Nrn. 3.5 und 3.6 werden durch folgende Nr. 3.5 ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext |
| `BayVV_2013_2_F_13526` | `non-invertible-amendment` | `recast` | 2. „Die Nrn. 3.3 und 3.4 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2030_2_3_K_12038` | `non-invertible-amendment` | `recast` | 1.1 1.1.1 „Nr. 1.2.3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2032_3_K_12914` | `non-invertible-amendment` | `recast` | 1.5 1.5.1 „Satz 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2032_4_K_942` | `non-invertible-amendment` | `recast` | 1.2 „Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2034_J_181` | `non-invertible-amendment` | `recast` | 1.1 „Der Titel wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2038_3_3_2_J_184` | `non-invertible-amendment` | `repeal-unit` | 1.2 1.2.2 „Nr. 1.1.2 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_2126_0_G_12665` | `non-invertible-amendment` | `recast` | 1.3 „Nr. 5.4 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2126_0_G_13305` | `non-invertible-amendment` | `delete-words` | 1.2 „In Nr. 1.1 Satz 3 werden die Angabe „der Buchst. B und C der Anlage 1.3 (Vergütungsverzeichnis) zum“ gestrichen und die Angabe „Vertrag“ dur“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_2130_0_F_13459` | `non-invertible-amendment` | `repeal-unit` | 4. a) „Satz 6 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_2162_A_10911` | `non-invertible-amendment` | `delete-words` | 1.2 1.2.1 „In Satz 1 wird das Wort „verbindlicher“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_2173_A_11662` | `non-invertible-amendment` | `recast` | 1.1 1.1.1 „Satz 2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2174_A_13397` | `non-invertible-amendment` | `repeal-unit` | 1.4 1.4.1 1.4.1.2 „Die Sätze 3 und 7 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_2191_F_1024` | `non-invertible-amendment` | `recast` | 1. „Satz 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2193_F_11308` | `non-invertible-amendment` | `delete-words` | 2. c) aa) „Die Wörter „dass er“ werden gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_2230_1_1_1_1_K_13367` | `non-invertible-amendment` | `recast` | 1.2 „Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2230_1_1_1_2_4_K_11098` | `non-invertible-amendment` | `delete-words` | 1.4 1.4.2 1.4.2.1 „Im dritten Spiegelstrich wird die Angabe „ab 1. März 2020“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_2230_1_3_UK_494` | `non-invertible-amendment` | `recast` | 1.2 „Die Anlagen 1 und 2 werden durch folgende Anlagen ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext |
| `BayVV_2231_A_10881` | `non-invertible-amendment` | `delete-words` | 1.3 „In Nr. 4 Satz 1 werden die Wörter „und von diesem grundsätzliche eine Bruttojahresvergütung (Arbeitnehmerbrutto) mindestens in Höhe der staa“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_2232_3_K_11645` | `non-invertible-amendment` | `repeal-unit` | 1.2 „Die Anlagen 12, 13, 14, 16 und 17 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_2234_1_K_13087` | `non-invertible-amendment` | `recast` | 1.1 „Nr. 1.3.6 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2234_1_K_13989` | `non-invertible-amendment` | `recast` | „Nr. 6 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2235_1_1_1_K_12238` | `non-invertible-amendment` | `recast` | 1.2 „Die bisherige Nr. 3 wird die Nr. 2.1 und wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2236_9_1_K_11147` | `non-invertible-amendment` | `recast` | 1.2 1.2.1 „In Satz 1 wird der dritte Spiegelstrich wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2244_F_13266` | `non-invertible-amendment` | `recast` | 1. „Nr. 4.1.1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_2330_B_12895` | `non-invertible-amendment` | `delete-words` | 1.1 1.1.1 „In der Überschrift werden die Wörter „Höhe der Förderung –“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_7011_W_10851` | `non-invertible-amendment` | `delete-words` | 1.2 „In Nr. 2 Satz 6 wird die Angabe „einschließlich der Errichtung von Einrichtungen zur praktischen Demonstration des Einsatzes neuer Technolog“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_7012_1_F_12963` | `non-invertible-amendment` | `recast` | 1. a) „Die Überschrift wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_7072_1_W_12957` | `non-invertible-amendment` | `recast` | 1.1 „Satz 1 der Vorbemerkung wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_73_I_11993` | `non-invertible-amendment` | `repeal-unit` | 1.4 „Nr. 7.1.8 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_73_I_2325` | `non-invertible-amendment` | `repeal-unit` | 1.5 „Die Nrn. 1.2.1 bis 1.2.6 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_73_W_11032` | `non-invertible-amendment` | `recast` | 1.2 „Die Nrn. 1.2 und 1.3 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_7523_W_13569` | `non-invertible-amendment` | `repeal-unit` | 1.2 1.2.3 „Satz 3 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVV_7801_L_10736` | `non-invertible-amendment` | `recast` | 1.1 „Nr. 3.8 Satz 2 wird wie folgt ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext |
| `BayVV_7803_2_L_10838` | `non-invertible-amendment` | `recast` | 1.1 „Der Wortlaut von Nr. 1.6 wird wie folgt ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext |
| `BayVV_7815_L_11779` | `non-invertible-amendment` | `recast` | 1.1 1.1.2 „Satz 3 erhält folgende neue Fassung:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_787_L_10691` | `non-invertible-amendment` | `recast` | 1.1 „Nr. 3 Spiegelstrich 2 wird wie folgt ersetzt:“: Ersetzung durch neuen Wortlaut ohne Alttext |
| `BayVV_787_L_13483` | `non-invertible-amendment` | `repeal-unit` | 1.1 1.1.1 „Der Spiegelstrich 8 wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayVV_787_L_13831` | `non-invertible-amendment` | `recast` | 1.1 1.1.1 „Satz 3 erhält folgende neue Fassung:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_787_L_13877` | `non-invertible-amendment` | `delete-words` | 1.5 1.5.1 „Die Angabe „ , soweit sie Beihilfecharakter hat,“ wird gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_7912_1_U_13349` | `non-invertible-amendment` | `delete-words` | 1.2 1.2.1 „In Spiegelstrich 1 wird die Angabe „Neupflanzung und Ersatz“ durch die Angabe „Pflanzung“ ersetzt und die Angabe „(einschließlich Herstellun“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_806_G_11201` | `non-invertible-amendment` | `delete-words` | 1.1 „In der Überschrift werden die Wörter „nach § 54 Berufsbildungsgesetz“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_8113_0_A_12472` | `non-invertible-amendment` | `recast` | 1.4 „Nr. 12 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVV_861_G_10013` | `non-invertible-amendment` | `delete-words` | 1.1 „In Nr. 1.1.1 Satz 2 werden die Wörter „in der Regel“ durch das Wort „regelmäßig“ ersetzt und die Wörter „wöchentlich oder 14-tägig“ gestrich“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVV_913_B_13942` | `non-invertible-amendment` | `recast` | „wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVergV_LPO_I` | `non-invertible-amendment` | `delete-words` | 2. a) aa) „Im Satzteil vor Nr. 1 wird die Angabe „ , Didaktik der Naturwissenschaft und Technik“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVerswG` | `non-invertible-amendment` | `delete-words` | 1. „In Abs. 1 wird die Angabe „(1)“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVwV152073` | `non-invertible-amendment` | `recast` | 1.2 „Nrn. 1.2 und 1.3 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV154359` | `non-invertible-amendment` | `recast` | 1.1 „Nr. 1.1.1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV231141` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayVwV233801` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Nrn. 16.4 bis 16.4.4 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVwV251529` | `non-invertible-amendment` | `recast` | 1. „Der Wortlaut vor Nr. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV257002` | `non-invertible-amendment` | `recast` | 4. „Nr. 1.2.10 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV257012` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Nrn. 1.1.3 bis 1.1.5 werden aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVwV263859` | `non-invertible-amendment` | `recast` | 1.2 1.2.1 „Die Sätze 1 bis 3 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV288385` | `non-invertible-amendment` | `recast` | 1.1 1.1.1 „Die Abs. 1 bis 3 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV288393` | `non-invertible-amendment` | `delete-words` | 1.1 „In § 3 Abs. 1 Satz 3 werden die Wörter „allgemein oder“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVwV290863` | `non-invertible-amendment` | `recast` | 1.2 „Der Prolog wird wie folgt neu gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV294820` | `non-invertible-amendment` | `recast` | 2. „Nr. 1.2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV312180` | `non-invertible-amendment` | `recast` | „Nr. 7.2 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV312206` | `non-invertible-amendment` | `recast` | 1.2 „Nr. 3.1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayVwV96486` | `non-invertible-amendment` | `repeal-unit` | 2.1 2.1.1 „Spiegelstrich 1 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayVwV96617` | `non-invertible-amendment` | `delete-words` | 1.1 1.1.3 1.1.3.2 „In Satz 4 wird die Angabe „in zweifacher Fertigung“ gestrichen.“: Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht |
| `BayVwZVG` | `non-invertible-amendment` | `recast` | 4. „Art. 15 Abs. 1 Satz 1 Nr. 3 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayWeinRAV` | `non-invertible-amendment` | `repeal-unit` | 1. „Die Inhaltsübersicht wird gestrichen.“: Streichung eines Glieds; der Wortlaut steht nicht im Befehl |
| `BayWkKV` | `non-invertible-amendment` | `recast` | 1. „Die Sätze 1 und 2 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayWkPV` | `non-invertible-amendment` | `recast` | 1. „Die Sätze 1 und 2 werden wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayZEPRV` | `non-invertible-amendment` | `recast` | 2. „§ 4 Abs. 3 Satz 5 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `BayZwEWG2008` | `non-invertible-amendment` | `repeal-unit` | 3. b) „Satz 5 wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayeAktVV` | `non-invertible-amendment` | `recast` | „§ 3 Abs. 1 wird wie folgt gefasst:“: Neufassung; der Alttext steht nicht im Befehl |
| `VVBayHO` | `non-invertible-amendment` | `repeal-unit` | 1. „Nr. 4 der VV zu Art. 23 (Zuwendungen) wird aufgehoben.“: Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl |
| `BayBeschGebV` | `asset-missing` | `annex-recast` | 12. „Die Anlage erhält die aus dem Anhang zu dieser Verordnung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayFachVVI` | `asset-missing` | `annex-recast` | 45. „Die Anlage aus dem Anhang zu dieser Verordnung wird angefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayGesVSV` | `asset-missing` | `annex-recast` | 7. „Die aus dem Anhang zu dieser Verordnung ersichtliche Anlage 2 wird angefügt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayKurtaxV` | `asset-missing` | `annex-recast` | 2. „Die Anlage 2 erhält die aus dem Anhang zu dieser Verordnung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayPKHGDB` | `asset-missing` | `annex-recast` | „erhalten die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_2030_13_U_13852` | `asset-missing` | `annex-recast` | 1.15 „Anlage 1 wird nach Maßgabe der dieser Bekanntmachung als Bestandteil beigefügten Anlage 1 neu gefasst.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_2173_A_13729` | `asset-missing` | `annex-recast` | „Anhang 1 wird durch den dieser Bekanntmachung beigefügten neuen Anhang 1 ersetzt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_2179_A_11861` | `asset-missing` | `annex-recast` | 1.13 „Die Anlage 1 wird durch die dieser Bekanntmachung beigefügte Anlage ersetzt. Die Anlage 2 wird aufgehoben.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_2230_1_1_1_1_3_UK_205` | `asset-missing` | `annex-recast` | 1.18 „Die Anlagen 1 bis 5 erhalten die aus dem Anhang dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_630_F_981` | `asset-missing` | `annex-recast` | 3. „Die Anlage 2 [Gruppierungsplan (GPl) mit Zuordnungshinweisen] erhält die aus dem Anhang 1 zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext  |
| `BayVV_7910_U_11781` | `asset-missing` | `annex-recast` | 1.18 „Die Anlage wird nach Maßgabe der dieser Bekanntmachung als Bestandteil beigefügten Anlage neu gefasst.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVwV102363` | `asset-missing` | `annex-recast` | „Die Anlagen 1 bis 3 erhalten die aus den Anlagen 1 bis 3 zu dieser Verwaltungsvorschrift ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVwV230264` | `asset-missing` | `annex-recast` | 15. „Die Anlagen 3 bis 6 und 8 erhalten die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVwV260147` | `asset-missing` | `annex-recast` | „erhält die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVwV265186` | `asset-missing` | `annex-recast` | 1.6 „Die Anlage wird durch die dieser Bekanntmachung beigefügten Anlagen 1 und 2 ersetzt.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVwV96569` | `asset-missing` | `annex-recast` | 1.13 „Anlage 2 erhält die aus dem Anhang zu dieser Bekanntmachung ersichtliche Fassung.“: Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl |
| `BayVV_2154_I_2270` | `contradictory` | `effective-after-evaluation` | Die Änderung tritt (teilweise) erst am 2027-01-01 in Kraft; der heutige Text kann sie noch nicht enthalten |

