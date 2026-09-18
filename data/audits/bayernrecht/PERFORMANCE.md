# Leistung und Großnormen BayWü

Stand: 2026-09-18 · Worker `landesrecht` (workers.dev) · lokaler Rechner (Apple Silicon, Node 25)

## Vollkorpus: Paket → Parser → Überleitung → validateNormRecord

Gemessen mit `/usr/bin/time -l node scripts/import-bayernrecht.ts inventory` (Dry-run, meldender Parser,
Textintegrität je Dokument):

| Kennzahl | Wert |
| --- | --- |
| Dokumente | 2 342 (alle `include`-Kandidaten mit Paket im Cache) |
| Gesamtdauer | 89,1 s Wanduhr (91,6 s Benutzerzeit) |
| Durchsatz | ≈ 26 Dokumente/s |
| Speicherspitze | 751 MB RSS (716 MB Footprint) |
| Ergebnis | 177 `parsed`, 2 136 `parsed-with-warnings`, 28 `integrity-mismatch`, 1 `transform-failed`, 0 `unknown-structure` |

Das größte Paket (`BayNat2000V`, 4,1 MB kanonisches JSON, 32 675 Blöcke) läuft ohne Streaming durch; ein
Streaming-Parser ist bei dieser Speicherspitze nicht nötig.

## Die 20 größten Normen im Worker

Abgerufen per GET von der veröffentlichten Instanz (`/bayern-wuerttemberg/norm/<slug>/`), geprüft:
HTTP-Status, Antwortzeit, Größe und ob ein Titelwort im HTML steht. Bei `baynat2000v-baywue` zusätzlich
geprüft, dass der **letzte** Block des Körpers („Anlage 2.84: Nördliches Erdinger Moos“) auf der Seite
steht und der sichtbare Text (≈ 710 000 Zeichen) den Normtext (675 788 Zeichen) vollständig abdeckt – keine
Kürzung, keine Seitenaufteilung.

| JSON-Größe | Status | Zeit | HTML | Titelwort | Norm |
| --- | --- | --- | --- | --- | --- |
| 4132 KB | 200 | 1.422087 s | 1050410 B | 11× „Bayern-Württembergische“ | `baynat2000v-baywue` |
| 1416 KB | 200 | 0.842232 s | 1047648 B | 9× „Bayern-Württembergische“ | `bayvv-versorgung-baywue` |
| 1104 KB | 200 | 0.480800 s | 130075 B | 2× „Verordnung“ | `flulaermv-in-baywue` |
| 1004 KB | 200 | 0.571292 s | 263664 B | 7× „Bußgeldkatalog“ | `bussgeldkatalog-umweltschutz-baywue` |
| 948 KB | 200 | 0.514590 s | 127754 B | 2× „Verordnung“ | `flulaermv-n-baywue` |
| 944 KB | 200 | 0.473467 s | 127242 B | 2× „Verordnung“ | `flulaermv-mm-baywue` |
| 760 KB | 200 | 0.389581 s | 93898 B | 2× „Verordnung“ | `flulaermv-nd-baywue` |
| 688 KB | 200 | 0.462946 s | 333566 B | 2× „Schulordnung“ | `vso-f-baywue` |
| 624 KB | 200 | 0.671907 s | 230392 B | 2× „Vollzugshinweise“ | `vollzugshinweise-zur-gebietsbezogenen-konkretisierung-der-erhaltungsziele-der-bayern-wuerttembergischen-natura-2-000-geb-baywue` |
| 612 KB | 200 | 0.931364 s | 472449 B | 4× „Verwaltungsvorschrift“ | `vvwas-baywue` |
| 528 KB | 200 | 0.465108 s | 264473 B | 2× „Verordnung“ | `eboa-baywue` |
| 400 KB | 200 | 0.483306 s | 434903 B | 2× „Verordnung“ | `verordnung-ueber-den-naturpark-spessart-baywue` |
| 380 KB | 200 | 0.494750 s | 97176 B | 2× „Staatsvertrag“ | `hoerfunk-ueberleitungsstaatsvertrag-baywue` |
| 372 KB | 200 | 0.345675 s | 138815 B | 4× „Verordnung“ | `euev-baywue` |
| 348 KB | 200 | 0.428740 s | 379020 B | 2× „Verordnung“ | `verordnung-ueber-den-naturpark-bayern-wuerttembergische-rhoen-baywue` |
| 288 KB | 200 | 0.402435 s | 212460 B | 4× „Verordnung“ | `lep-baywue` |
| 288 KB | 200 | 0.366494 s | 311677 B | 2× „Staatsvertrag“ | `gluestv-2021-baywue` |
| 272 KB | 200 | 0.437924 s | 276563 B | 2× „Polizeiaufgabengesetzes“ | `vollzug-des-polizeiaufgabengesetzes-baywue` |
| 268 KB | 200 | 0.435505 s | 266903 B | 3× „Allgemeine“ | `vvbaysueg-baywue` |
| 260 KB | 200 | 0.372074 s | 204883 B | 3× „Feststellung“ | `hg-2023-baywue` |

Alle 20 antworten mit 200 und zeigen die Norm; die langsamste Seite (BayNat2000V) braucht 1,4 s.
