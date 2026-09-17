# Performance-Baseline

Gemessen 2026-09-16T23:24:56.322Z, 5 Läufe je Fall, Node v25.9.0. Median/P95 in ms.

## Lokal (Miniflare-D1, lesend)

| Fall | Median | P95 |
| --- | ---: | ---: |
| Content laden (alle West-Normen, Dateien) | 244 | 277 |
| D1 Normliste (500) | 3 | 147 |
| D1 Typzähler | 0 | 1 |
| Suche exakter Titel (Ladenöffnungszeiten) | 6 | 18 |
| Suche Abkürzung „LÖG West“ | 4 | 6 |
| Suche Abkürzung „DVO KiBiz“ | 1 | 2 |
| Suche Volltext „Erlaubnis“ | 8 | 31 |
| Suche §-Adresse „§ 5 LÖG West“ | 49 | 284 |
| Suche VwV „Nr. 4.2 VV LHundG West“ | 45 | 46 |
| Suche Typfilter VwV „Erlaubnis“ | 4 | 5 |
| Suche langer Titel (Verfassung) | 13 | 21 |

## Remote (https://landesrecht.xyungeloestlp.workers.dev)

| Fall | Median | P95 |
| --- | ---: | ---: |
| Länderseite /west/ | 166 | 342 |
| Norm LÖG | 120 | 146 |
| Suche Abkürzung „LÖG West“ | 150 | 180 |
| Suche Volltext „Erlaubnis“ | 188 | 193 |
| Suche §-Adresse „§ 5 LÖG West“ | 305 | 312 |
