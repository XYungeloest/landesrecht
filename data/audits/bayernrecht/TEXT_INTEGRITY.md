# Textintegrität des BayWü-Korpus

**Stand 2026-09-18.** Für jedes erfolgreich geparste Dokument wird der sichtbare Quelltext gegen den
kanonischen Text gehalten. Verglichen wird die Wortmenge, nicht die Zeichenfolge: Erlaubt sind Leerraum,
Entitäten, typografische Normalisierung und strukturelle Neuzusammensetzung **ohne Textverlust**. Nicht
erlaubt sind verlorene Sätze, Tabellen, Fußnoten und Anlageninhalte – und keine Verdopplung.

Geprüft: **2342** Dokumente.

| Klasse | Dokumente | Anteil | Bedeutung |
| --- | --- | --- | --- |
| `exact` | 241 | 10,3 % | dieselbe Wortfolge; es musste nichts normalisiert werden |
| `normalized-equivalent` | 1305 | 55,7 % | dieselben Wörter nach typografischer Normalisierung (auch neu zusammengesetzt, ohne Verlust) |
| `explained-difference` | 796 | 34,0 % | Unterschied vollständig durch einen benannten Befund erklärt |
| `review` | 0 | 0,0 % | bis zu 3 unerklärte Wörter – Einzelfall, von Hand zu entscheiden |
| `mismatch` | 0 | 0,0 % | Textverlust oder Verdopplung – Importhindernis |

`@builddate` des Exports geht in keinen Vergleich ein: Das Portal baut den Export täglich neu.

## `mismatch` · 0 Dokumente

Textverlust oder Verdopplung – Importhindernis.

Kein Dokument in dieser Klasse.

## `review` · 0 Dokumente

bis zu 3 unerklärte Wörter – Einzelfall, von Hand zu entscheiden.

Kein Dokument in dieser Klasse.

## `explained-difference` · 796 Dokumente

Unterschied vollständig durch einen benannten Befund erklärt.

- `ARDStV` (byrecht-norm): 2163 Wörter in der Quelle · 2165 kanonisch · erklärt durch footnote-marker-substituted
- `AkadGrAuslHsStV` (byrecht-norm): 769 Wörter in der Quelle · 772 kanonisch · erklärt durch footnote-label-repeats-call-marker, footnote-marker-substituted
- `ApothStV` (byrecht-norm): 1158 Wörter in der Quelle · 1160 kanonisch · erklärt durch footnote-marker-substituted
- `BAY_110_1984_201` (byrecht-norm): 329 Wörter in der Quelle · 331 kanonisch · erklärt durch footnote-marker-substituted
- `BAY_110_1990_478` (byrecht-norm): 2563 Wörter in der Quelle · 2557 kanonisch · erklärt durch annex-number-repeated-in-source
- … und 791 weitere Dokumente dieser Klasse

## `normalized-equivalent` · 1305 Dokumente

dieselben Wörter nach typografischer Normalisierung (auch neu zusammengesetzt, ohne Verlust).

- `BAY_2210_2_5_4_WFK` (byrecht-norm): 1329 Wörter in der Quelle · 1329 kanonisch
- `BAY_2237_4_UK` (byrecht-norm): 813 Wörter in der Quelle · 813 kanonisch
- `Bay224BRAOBefUeV` (byrecht-norm): 273 Wörter in der Quelle · 273 kanonisch
- `BayAAV` (byrecht-norm): 1656 Wörter in der Quelle · 1656 kanonisch
- `BayABOB` (byrecht-norm): 3637 Wörter in der Quelle · 3637 kanonisch
- … und 1300 weitere Dokumente dieser Klasse

## `exact` · 241 Dokumente

dieselbe Wortfolge; es musste nichts normalisiert werden.

- `BayRegisSTARDV` (byrecht-vv): 841 Wörter in der Quelle · 841 kanonisch
- `BayVV_1102_F_875` (byrecht-vv): 510 Wörter in der Quelle · 510 kanonisch
- `BayVV_1132_F_035` (byrecht-vv): 277 Wörter in der Quelle · 277 kanonisch
- `BayVV_1132_F_054` (byrecht-vv): 248 Wörter in der Quelle · 248 kanonisch
- `BayVV_2003_4_J_504` (byrecht-vv): 762 Wörter in der Quelle · 762 kanonisch
- … und 236 weitere Dokumente dieser Klasse

